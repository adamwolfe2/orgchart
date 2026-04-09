import { NextResponse } from 'next/server'
import { getCurrentUserAndMembership } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import type { ApiResponse } from '@/lib/types'

interface CancelRequest {
  staging_id: string
}

/**
 * POST /api/employees/upload/cancel
 *
 * Deletes a staged upload without committing it. Used by the preview
 * UI "Cancel / re-upload" button.
 */
export async function POST(request: Request) {
  try {
    const auth = await getCurrentUserAndMembership()
    if (!auth) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'unauthorized' },
        { status: 401 },
      )
    }

    const { membership } = auth
    if (!membership || (membership.role !== 'owner' && membership.role !== 'admin')) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'forbidden' },
        { status: 403 },
      )
    }

    let body: CancelRequest
    try {
      body = (await request.json()) as CancelRequest
    } catch {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'invalid json body' },
        { status: 400 },
      )
    }

    if (!body.staging_id || typeof body.staging_id !== 'string') {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'staging_id required' },
        { status: 400 },
      )
    }

    const admin = createAdminClient()
    const { error } = await admin
      .from('employee_upload_stagings')
      .delete()
      .eq('id', body.staging_id)
      .eq('organization_id', membership.organization_id)

    if (error) {
      console.error('Failed to cancel staging:', error)
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: error.message },
        { status: 500 },
      )
    }

    return NextResponse.json<ApiResponse<{ cancelled: true }>>({
      success: true,
      data: { cancelled: true },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'internal error'
    console.error('POST /api/employees/upload/cancel failed:', err)
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: message },
      { status: 500 },
    )
  }
}
