import { NextResponse } from 'next/server'
import { getCurrentUserAndMembership } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { embedTexts, employeeSourceText } from '@/lib/embeddings'
import type { CsvRow } from '@/lib/csv'
import type { ApiResponse } from '@/lib/types'

interface CommitRequest {
  staging_id: string
}

interface CommitResultData {
  count: number
  upload_batch_id: string
}

/**
 * POST /api/employees/upload/commit
 *
 * Promotes a staged upload into the employees table. The staging row
 * must belong to the caller's org, must not be expired, and the caller
 * must be an org owner/admin.
 *
 * On success, upserts all parsed rows (tagged with the staging row's
 * upload_batch_id for future rollback), best-effort generates
 * embeddings, and deletes the staging row.
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

    let body: CommitRequest
    try {
      body = (await request.json()) as CommitRequest
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

    const { data: staging, error: stagingError } = await admin
      .from('employee_upload_stagings')
      .select('id, organization_id, parsed_rows, upload_batch_id, expires_at')
      .eq('id', body.staging_id)
      .maybeSingle()

    if (stagingError) {
      console.error('Failed to load staging row:', stagingError)
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: stagingError.message },
        { status: 500 },
      )
    }

    if (!staging) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'staging row not found or already committed' },
        { status: 404 },
      )
    }

    if (staging.organization_id !== membership.organization_id) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'forbidden' },
        { status: 403 },
      )
    }

    if (new Date(staging.expires_at).getTime() < Date.now()) {
      // Clean up the expired row so it doesn't stick around
      await admin.from('employee_upload_stagings').delete().eq('id', staging.id)
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'staging row expired — please re-upload' },
        { status: 410 },
      )
    }

    const parsedRows = staging.parsed_rows as CsvRow[]
    if (!Array.isArray(parsedRows) || parsedRows.length === 0) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'staging row contained no rows' },
        { status: 400 },
      )
    }

    const organizationId = membership.organization_id
    const uploadBatchId = staging.upload_batch_id as string

    const employeeRows = parsedRows.map((row) => ({
      organization_id: organizationId,
      first_name: row.first_name,
      last_name: row.last_name,
      email: row.email,
      position: row.position || null,
      supervisor_email: row.supervisor_email || null,
      context: row.context || null,
      upload_batch_id: uploadBatchId,
    }))

    const { data: upserted, error: upsertError } = await admin
      .from('employees')
      .upsert(employeeRows, {
        onConflict: 'organization_id,email',
        ignoreDuplicates: false,
      })
      .select('id, first_name, last_name, position, context')

    if (upsertError) {
      console.error('Failed to upsert employees:', upsertError)
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: upsertError.message },
        { status: 500 },
      )
    }

    const inserted = upserted ?? []

    // Best-effort embeddings — failures must NOT fail the commit.
    try {
      if (inserted.length > 0) {
        const texts = inserted.map((emp) => employeeSourceText(emp))
        const vectors = await embedTexts(texts)
        const embeddingRows = inserted.map((emp, i) => ({
          employee_id: emp.id,
          organization_id: organizationId,
          embedding: vectors[i],
          source_text: texts[i],
        }))

        const { error: embedUpsertError } = await admin
          .from('employee_embeddings')
          .upsert(embeddingRows, { onConflict: 'employee_id' })

        if (embedUpsertError) {
          console.error('Failed to upsert embeddings:', embedUpsertError)
        }
      }
    } catch (embedErr) {
      console.error('Embedding generation failed (non-fatal):', embedErr)
    }

    // Clean up the staging row now that it's committed.
    await admin
      .from('employee_upload_stagings')
      .delete()
      .eq('id', staging.id)

    return NextResponse.json<ApiResponse<CommitResultData>>({
      success: true,
      data: {
        count: inserted.length,
        upload_batch_id: uploadBatchId,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'internal error'
    console.error('POST /api/employees/upload/commit failed:', err)
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: message },
      { status: 500 },
    )
  }
}
