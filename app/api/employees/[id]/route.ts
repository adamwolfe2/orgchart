import { NextResponse } from 'next/server'
import { z } from 'zod'

import { getCurrentUserAndMembership } from '@/lib/auth'
import { refreshEmployeeEmbedding } from '@/lib/embeddings'
import { createClient } from '@/lib/supabase/server'
import type { ApiResponse, Employee } from '@/lib/types'

const updateSchema = z.object({
  first_name: z.string().min(1, 'First name required').max(100).optional(),
  last_name: z.string().min(1, 'Last name required').max(100).optional(),
  position: z.string().max(200).nullable().optional(),
  supervisor_email: z.string().email('Invalid email').nullable().optional(),
  context: z.string().max(5000).nullable().optional(),
  linkedin_url: z.union([z.string().url('Invalid URL'), z.literal(''), z.null()]).optional(),
  phone: z.string().max(50).nullable().optional(),
  custom_links: z
    .array(z.object({ label: z.string().min(1).max(100), url: z.string().url() }))
    .max(10)
    .optional(),
})

export type EmployeeUpdatePayload = z.infer<typeof updateSchema>

/**
 * PATCH /api/employees/[id]
 *
 * Admin-only. Edits any employee in the admin's organization.
 * RLS policy `employees_admin_write` enforces org isolation.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await getCurrentUserAndMembership()
    if (!auth?.membership) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'unauthorized' },
        { status: 401 },
      )
    }

    const isAdmin =
      auth.membership.role === 'owner' || auth.membership.role === 'admin'
    if (!isAdmin) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'forbidden' },
        { status: 403 },
      )
    }

    const { id } = await params
    const rawBody = await request.json().catch(() => null)
    const parsed = updateSchema.safeParse(rawBody)
    if (!parsed.success) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: parsed.error.issues[0]?.message ?? 'invalid request' },
        { status: 400 },
      )
    }

    const supabase = await createClient()

    // Confirm the employee belongs to this admin's org (belt + suspenders on top of RLS)
    const { data: existing } = await supabase
      .from('employees')
      .select('id, organization_id')
      .eq('id', id)
      .eq('organization_id', auth.membership.organization_id)
      .maybeSingle()

    if (!existing) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'employee not found' },
        { status: 404 },
      )
    }

    const d = parsed.data
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (d.first_name !== undefined) patch.first_name = d.first_name
    if (d.last_name !== undefined) patch.last_name = d.last_name
    if ('position' in d) patch.position = d.position ?? null
    if ('supervisor_email' in d) patch.supervisor_email = d.supervisor_email ?? null
    if ('context' in d) patch.context = d.context ?? null
    if ('linkedin_url' in d) patch.linkedin_url = d.linkedin_url || null
    if ('phone' in d) patch.phone = d.phone ?? null
    if ('custom_links' in d) patch.custom_links = d.custom_links ?? []

    const { data: updated, error } = await supabase
      .from('employees')
      .update(patch)
      .eq('id', id)
      .select(
        'id, organization_id, first_name, last_name, email, position, supervisor_email, context, headshot_url, linkedin_url, phone, custom_links, slack_user_id, claimed_by_user_id, created_at, updated_at',
      )
      .single()

    if (error || !updated) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'update failed' },
        { status: 500 },
      )
    }

    refreshEmployeeEmbedding(id).catch(() => {})

    return NextResponse.json<ApiResponse<{ employee: Employee }>>({
      success: true,
      data: { employee: updated as Employee },
    })
  } catch (err) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'internal server error' },
      { status: 500 },
    )
  }
}
