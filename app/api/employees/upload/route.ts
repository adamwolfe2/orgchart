import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { getCurrentUserAndMembership } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseEmployeeCsv, type CsvIssue, type HeaderMapping } from '@/lib/csv'
import { embedTexts, employeeSourceText } from '@/lib/embeddings'
import type { ApiResponse } from '@/lib/types'

const MAX_CSV_BYTES = 5 * 1024 * 1024 // 5MB

interface UploadResultData {
  count: number
  headerMappings: HeaderMapping[]
  warnings: CsvIssue[]
  unmappedHeaders: string[]
  upload_batch_id: string
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
 * Parses + validates the CSV, upserts employees via the service-role client
 * (RLS would otherwise require many round-trips), then best-effort generates
 * embeddings for chat/RAG.
 *
 * Embedding failures do not fail the upload — chat is a Phase 3 feature and
 * is optional for MVP. We log the error and return success regardless.
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

    // Hard errors block the upload: missing required headers, no parseable rows.
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
    const uploadBatchId = randomUUID()

    const employeeRows = result.rows.map((row) => ({
      organization_id: organizationId,
      first_name: row.first_name,
      last_name: row.last_name,
      email: row.email,
      position: row.position || null,
      supervisor_email: row.supervisor_email || null,
      context: row.context || null,
      upload_batch_id: uploadBatchId,
    }))

    const admin = createAdminClient()

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

    // Best-effort embedding generation. Failures here must NOT fail the upload.
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

    return NextResponse.json<ApiResponse<UploadResultData>>({
      success: true,
      data: {
        count: inserted.length,
        headerMappings: result.headerMappings,
        warnings: result.warnings,
        unmappedHeaders: result.unmappedHeaders,
        upload_batch_id: uploadBatchId,
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
