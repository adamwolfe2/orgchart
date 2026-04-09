import { NextResponse } from 'next/server'

import { getCurrentUserAndMembership } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import type { ApiResponse } from '@/lib/types'

function isAdmin(role: string) {
  return role === 'owner' || role === 'admin'
}

/**
 * DELETE /api/org/invites/[id]
 *
 * Revokes the given invite by setting revoked_at = now().
 * Scoped to the admin's own organization for safety; RLS also enforces this.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
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

    const { id } = await params

    const supabase = await createClient()
    const { data, error } = await supabase
      .from('organization_invites')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', id)
      .eq('organization_id', auth.membership.organization_id)
      .select('id')
      .single()

    if (error || !data) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'invite not found or already revoked' },
        { status: 404 },
      )
    }

    return NextResponse.json<ApiResponse<{ id: string }>>({
      success: true,
      data: { id: data.id as string },
    })
  } catch (err) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'internal server error' },
      { status: 500 },
    )
  }
}
