import { NextResponse } from 'next/server'
import { z } from 'zod'

import { getCurrentUserAndMembership, isAdmin } from '@/lib/auth'
import { generateInviteToken, listInvitesForOrg } from '@/lib/invites'
import { createClient } from '@/lib/supabase/server'
import type { ApiResponse, OrganizationInvite } from '@/lib/types'

const createInviteSchema = z.object({
  max_uses: z
    .number()
    .int('max_uses must be an integer')
    .positive('max_uses must be positive')
    .optional(),
  expires_in_days: z
    .number()
    .int('expires_in_days must be an integer')
    .positive('expires_in_days must be positive')
    .max(365, 'expires_in_days cannot exceed 365')
    .optional(),
})

/**
 * POST /api/org/invites
 *
 * Creates a new invite link for the authenticated admin's organization.
 * Uses the RLS-bound server client — the invites_admin_rw policy enforces
 * that only org owners/admins can insert.
 */
export async function POST(request: Request) {
  try {
    const auth = await getCurrentUserAndMembership()

    if (!auth || !auth.membership) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'unauthorized' },
        { status: 401 },
      )
    }

    if (!isAdmin(auth.membership.role)) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'forbidden: admin role required' },
        { status: 403 },
      )
    }

    const rawBody = await request.json().catch(() => null)
    const parsed = createInviteSchema.safeParse(rawBody ?? {})

    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? 'invalid request'
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: message },
        { status: 400 },
      )
    }

    const { max_uses, expires_in_days } = parsed.data

    const expiresAt = expires_in_days
      ? new Date(Date.now() + expires_in_days * 24 * 60 * 60 * 1000).toISOString()
      : null

    const token = generateInviteToken()

    const supabase = await createClient()
    const { data: invite, error } = await supabase
      .from('organization_invites')
      .insert({
        organization_id: auth.membership.organization_id,
        token,
        created_by: auth.user.id,
        max_uses: max_uses ?? null,
        expires_at: expiresAt,
      })
      .select(
        'id, organization_id, token, created_by, max_uses, used_count, expires_at, revoked_at, created_at',
      )
      .single()

    if (error || !invite) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'failed to create invite' },
        { status: 500 },
      )
    }

    return NextResponse.json<ApiResponse<{ invite: OrganizationInvite }>>(
      { success: true, data: { invite: invite as OrganizationInvite } },
      { status: 201 },
    )
  } catch (err) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'internal server error' },
      { status: 500 },
    )
  }
}

/**
 * GET /api/org/invites
 *
 * Returns up to 50 invite rows for the admin's organization.
 */
export async function GET() {
  try {
    const auth = await getCurrentUserAndMembership()

    if (!auth || !auth.membership) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'unauthorized' },
        { status: 401 },
      )
    }

    if (!isAdmin(auth.membership.role)) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'forbidden: admin role required' },
        { status: 403 },
      )
    }

    const invites = await listInvitesForOrg(auth.membership.organization_id)

    return NextResponse.json<ApiResponse<{ invites: OrganizationInvite[] }>>({
      success: true,
      data: { invites },
    })
  } catch (err) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'internal server error' },
      { status: 500 },
    )
  }
}
