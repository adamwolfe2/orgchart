import { NextResponse } from 'next/server'
import { z } from 'zod'

import { getCurrentUserAndMembership } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import type { ApiResponse } from '@/lib/types'

const acceptSchema = z.object({
  token: z.string().min(1, 'token is required'),
})

/**
 * POST /api/org/invites/accept
 *
 * Accepts an invite token and adds the authenticated user as a member
 * of the invite's organization.
 *
 * Token lookup uses the admin client (service-role) because there is no
 * public RLS read policy on organization_invites — token validation must
 * happen server-side with elevated privileges.
 *
 * Membership insert uses the RLS-bound server client so the
 * memberships insert policy is exercised normally.
 */
export async function POST(request: Request) {
  try {
    // 1. Auth — user must be signed in
    const auth = await getCurrentUserAndMembership()

    if (!auth) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'unauthorized' },
        { status: 401 },
      )
    }

    // 2. Parse and validate body
    const rawBody = await request.json().catch(() => null)
    const parsed = acceptSchema.safeParse(rawBody)

    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? 'invalid request'
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: message },
        { status: 400 },
      )
    }

    const { token } = parsed.data

    // 3. Look up the invite via admin client (bypasses RLS — no public select policy)
    const adminClient = createAdminClient()
    const { data: invite, error: inviteLookupError } = await adminClient
      .from('organization_invites')
      .select('id, organization_id, max_uses, used_count, expires_at, revoked_at')
      .eq('token', token)
      .maybeSingle()

    if (inviteLookupError || !invite) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'invite not found' },
        { status: 404 },
      )
    }

    // 4. Validate invite is still usable
    if (invite.revoked_at) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'this invite has been revoked' },
        { status: 410 },
      )
    }

    if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'this invite has expired' },
        { status: 410 },
      )
    }

    if (
      invite.max_uses !== null &&
      invite.used_count >= invite.max_uses
    ) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'this invite has reached its maximum uses' },
        { status: 410 },
      )
    }

    // 5. Idempotency — if the user is already a member of this org, succeed early
    if (auth.membership?.organization_id === invite.organization_id) {
      return NextResponse.json<ApiResponse<{ organization_id: string }>>({
        success: true,
        data: { organization_id: invite.organization_id as string },
      })
    }

    // 6. Insert membership row (RLS-bound server client)
    const supabase = await createClient()
    const { error: membershipError } = await supabase
      .from('memberships')
      .insert({
        user_id: auth.user.id,
        organization_id: invite.organization_id,
        role: 'member',
      })

    if (membershipError) {
      // Unique constraint violation = already a member (race condition / retry)
      if (membershipError.code === '23505') {
        return NextResponse.json<ApiResponse<{ organization_id: string }>>({
          success: true,
          data: { organization_id: invite.organization_id as string },
        })
      }

      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'failed to join organization' },
        { status: 500 },
      )
    }

    // 7. Increment used_count with optimistic concurrency (admin client)
    //    Try to update where used_count = current value. If another request
    //    raced us, retry once with the new count.
    const currentCount = invite.used_count as number
    const { data: updatedRows } = await adminClient
      .from('organization_invites')
      .update({ used_count: currentCount + 1 })
      .eq('id', invite.id)
      .eq('used_count', currentCount)
      .select('id')

    if (!updatedRows || updatedRows.length === 0) {
      // Retry once — fetch fresh count and try again
      const { data: fresh } = await adminClient
        .from('organization_invites')
        .select('used_count')
        .eq('id', invite.id)
        .single()

      if (fresh) {
        await adminClient
          .from('organization_invites')
          .update({ used_count: (fresh.used_count as number) + 1 })
          .eq('id', invite.id)
      }
    }

    return NextResponse.json<ApiResponse<{ organization_id: string }>>({
      success: true,
      data: { organization_id: invite.organization_id as string },
    })
  } catch (err) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'internal server error' },
      { status: 500 },
    )
  }
}
