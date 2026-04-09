import { NextResponse } from 'next/server'
import { getCurrentUserAndMembership } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseEmployeeCsv, type CsvIssue, type HeaderMapping } from '@/lib/csv'
import type { ApiResponse } from '@/lib/types'

const MAX_CSV_BYTES = 5 * 1024 * 1024 // 5MB

interface UploadStagedData {
  staging_id: string
  count: number
  headerMappings: HeaderMapping[]
  warnings: CsvIssue[]
  unmappedHeaders: string[]
}

interface UploadValidationError extends ApiResponse<never> {
  errors: CsvIssue[]
  warnings?: CsvIssue[]
  headerMappings?: HeaderMapping[]
  unmappedHeaders?: string[]
  missingRequired?: string[]
}

/**
 * POST /api/employees/upload
 *
 * Accepts a multipart/form-data body with a `file` field (CSV).
 * Parses + validates the CSV and writes the result to the
 * `employee_upload_stagings` table so the user can preview it
 * before committing. Returns `{ staging_id }` on success.
 *
 * Does NOT write to the employees table — that happens on
 * POST /api/employees/upload/commit.
 *
 * Sweeps expired staging rows for the caller's org as a side effect
 * so the table doesn't grow unbounded.
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

    const { membership, user } = auth
    if (!membership || (membership.role !== 'owner' && membership.role !== 'admin')) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'forbidden' },
        { status: 403 },
      )
    }

    let formData: FormData
    try {
      formData = await request.formData()
    } catch (err) {
      console.error('Failed to parse form data:', err)
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'invalid form data' },
        { status: 400 },
      )
    }

    const fileField = formData.get('file')
    if (!fileField || !(fileField instanceof File)) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'no file' },
        { status: 400 },
      )
    }

    if (fileField.size > MAX_CSV_BYTES) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'file too large (max 5MB)' },
        { status: 413 },
      )
    }

    const csvText = await fileField.text()
    const result = parseEmployeeCsv(csvText)

    if (result.errors.length > 0) {
      return NextResponse.json<UploadValidationError>(
        {
          success: false,
          error: 'validation',
          errors: result.errors,
          warnings: result.warnings,
          headerMappings: result.headerMappings,
          unmappedHeaders: result.unmappedHeaders,
          missingRequired: result.missingRequired,
        },
        { status: 400 },
      )
    }

    if (result.rows.length === 0) {
      return NextResponse.json<UploadValidationError>(
        {
          success: false,
          error: 'empty CSV',
          errors: [],
          warnings: result.warnings,
          headerMappings: result.headerMappings,
          unmappedHeaders: result.unmappedHeaders,
        },
        { status: 400 },
      )
    }

    const organizationId = membership.organization_id
    const admin = createAdminClient()

    // Opportunistic sweep: delete any expired staging rows for this org
    // so the table doesn't accumulate. Cheap query, hits the
    // expires_at index.
    await admin
      .from('employee_upload_stagings')
      .delete()
      .eq('organization_id', organizationId)
      .lt('expires_at', new Date().toISOString())

    const { data: inserted, error: stagingError } = await admin
      .from('employee_upload_stagings')
      .insert({
        organization_id: organizationId,
        created_by: user.id,
        parsed_rows: result.rows,
        warnings: result.warnings,
        header_mappings: result.headerMappings,
        unmapped_headers: result.unmappedHeaders,
        source_filename: fileField.name || null,
      })
      .select('id')
      .single()

    if (stagingError || !inserted) {
      console.error('Failed to stage upload:', stagingError)
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: stagingError?.message ?? 'failed to stage upload' },
        { status: 500 },
      )
    }

    return NextResponse.json<ApiResponse<UploadStagedData>>({
      success: true,
      data: {
        staging_id: inserted.id,
        count: result.rows.length,
        headerMappings: result.headerMappings,
        warnings: result.warnings,
        unmappedHeaders: result.unmappedHeaders,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'internal error'
    console.error('POST /api/employees/upload failed:', err)
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: message },
      { status: 500 },
    )
  }
}
