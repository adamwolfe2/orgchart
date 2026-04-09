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

    // 4b. Soft check — actual enforcement happens atomically below
    if (
      invite.max_uses !== null &&
      invite.used_count >= invite.max_uses
    ) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'invite no longer valid' },
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

    // 6. Atomically increment used_count BEFORE inserting membership.
    //    The WHERE clause gates on used_count < max_uses (or unlimited when
    //    max_uses is null). If 0 rows are returned, the invite is exhausted.
    const { data: claimed, error: claimError } = await adminClient
      .from('organization_invites')
      .update({ used_count: (invite.used_count as number) + 1 })
      .eq('id', invite.id)
      .or(`max_uses.is.null,used_count.lt.${invite.max_uses ?? 999999999}`)
      .is('revoked_at', null)
      .select('id')

    if (claimError || !claimed || claimed.length === 0) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'invite no longer valid' },
        { status: 410 },
      )
    }

    // 7. Insert membership row (RLS-bound server client)
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

      // Rollback the used_count increment — best-effort
      try {
        await adminClient
          .from('organization_invites')
          .update({ used_count: invite.used_count })
          .eq('id', invite.id)
      } catch {
        // swallow rollback errors
      }

      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'failed to join organization' },
        { status: 500 },
      )
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
