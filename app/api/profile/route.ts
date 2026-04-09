import { NextResponse } from 'next/server'

import { getCurrentUserAndMembership } from '@/lib/auth'
import { refreshEmployeeEmbedding } from '@/lib/embeddings'
import { profileSchema } from '@/lib/profile'
import { createClient } from '@/lib/supabase/server'
import type { ApiResponse, Employee } from '@/lib/types'

/**
 * PATCH /api/profile
 *
 * Updates the current user's claimed employee row.
 * Validates with the shared profileSchema from lib/profile.ts.
 * Fires-and-forgets an embedding refresh after a successful update.
 */
export async function PATCH(request: Request) {
  try {
    // 1. Auth
    const auth = await getCurrentUserAndMembership()
    if (!auth) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'unauthorized' },
        { status: 401 },
      )
    }

    // 2. Parse and validate body
    const rawBody = await request.json().catch(() => null)
    const parsed = profileSchema.safeParse(rawBody)
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? 'invalid request'
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: message },
        { status: 400 },
      )
    }

    const { position, context, linkedin_url, phone, custom_links } = parsed.data

    // headshot_url is ONLY set by the /api/profile/headshot upload route.
    // We do not accept it from the PATCH body to prevent stored XSS
    // via arbitrary URLs.

    // 3. Look up the claimed employee for this user
    const supabase = await createClient()
    const { data: employee, error: lookupError } = await supabase
      .from('employees')
      .select('id, organization_id')
      .eq('claimed_by_user_id', auth.user.id)
      .maybeSingle()

    if (lookupError || !employee) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'no claimed employee found' },
        { status: 404 },
      )
    }

    // 4. Build the update payload with explicit fields only.
    // headshot_url deliberately excluded — only the upload route sets it.
    const updatePayload = {
      position: position ?? null,
      context: context ?? null,
      linkedin_url: linkedin_url ?? null,
      phone: phone ?? null,
      custom_links: custom_links ?? [],
    }

    // 5. Perform the update (RLS employees_self_update allows this)
    const { data: updated, error: updateError } = await supabase
      .from('employees')
      .update(updatePayload)
      .eq('id', employee.id)
      .select(
        'id, organization_id, first_name, last_name, email, position, supervisor_email, context, headshot_url, linkedin_url, phone, custom_links, slack_user_id, claimed_by_user_id, created_at, updated_at',
      )
      .single()

    if (updateError || !updated) {
      console.error('profile PATCH: update failed', { error: updateError?.message })
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'failed to update profile' },
        { status: 500 },
      )
    }

    // 6. Fire-and-forget embedding refresh (swallow errors)
    refreshEmployeeEmbedding(employee.id).catch((err: unknown) => {
      console.error('profile PATCH: embedding refresh failed', {
        error: err instanceof Error ? err.message : String(err),
      })
    })

    return NextResponse.json<ApiResponse<{ employee: Employee }>>({
      success: true,
      data: { employee: updated as Employee },
    })
  } catch (err) {
    console.error('profile PATCH: unexpected error', {
      error: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'internal server error' },
      { status: 500 },
    )
  }
}
