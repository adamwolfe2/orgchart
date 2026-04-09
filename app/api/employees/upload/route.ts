import { NextResponse } from 'next/server'
import { getCurrentUserAndMembership } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  parseEmployeeCsv,
  type CsvIssue,
  type CsvParseResult,
  type HeaderMapping,
} from '@/lib/csv'
import {
  isLlmEnabled,
  llmResolveHeaders,
  llmResolveSupervisors,
} from '@/lib/csv/llm'
import type { ApiResponse } from '@/lib/types'

const MAX_CSV_BYTES = 5 * 1024 * 1024 // 5MB

/**
 * Per-org rate limit for the parse endpoint. The full flow is heavy:
 * papaparse + zod validation + optional LLM fallback (cached, but the
 * first call is non-trivial) + writing a jsonb staging row. Cap the
 * rate so a runaway script (or a mis-wired client retry loop) can't
 * burn LLM credits or flood the staging table.
 *
 * Window is sliding — we count rows created in the last RATE_WINDOW_MS
 * for the caller's organization. Enforced via the existing
 * employee_upload_stagings table so there's no new infrastructure.
 */
const RATE_LIMIT_MAX = 10
const RATE_WINDOW_MS = 60_000

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
    let result = parseEmployeeCsv(csvText)
    result = await applyLlmFallbacks(csvText, result)

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

    // Per-org rate limit. Count staging rows this org has created in
    // the last RATE_WINDOW_MS. 429 if they're over the cap.
    const windowStart = new Date(Date.now() - RATE_WINDOW_MS).toISOString()
    const { count: recentCount } = await admin
      .from('employee_upload_stagings')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .gte('created_at', windowStart)

    if ((recentCount ?? 0) >= RATE_LIMIT_MAX) {
      return NextResponse.json<ApiResponse<never>>(
        {
          success: false,
          error: `rate limited — max ${RATE_LIMIT_MAX} uploads per minute per organization. Try again shortly.`,
        },
        {
          status: 429,
          headers: {
            'Retry-After': Math.ceil(RATE_WINDOW_MS / 1000).toString(),
          },
        },
      )
    }

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

/**
 * Optional LLM fallback pass. Runs only when CSV_LLM_ENABLED=true.
 *
 * Two opportunities:
 *   1. If the local parse returned hard errors because of missing
 *      required headers, call llmResolveHeaders() with the raw headers
 *      + sample rows. If the LLM returns high-confidence mappings that
 *      cover the missing fields, re-parse with those overrides pinned.
 *
 *   2. If the local parse succeeded but left unresolved supervisors,
 *      batch them to llmResolveSupervisors() with pre-ranked candidate
 *      shortlists. Patch the result rows with any high/medium confidence
 *      resolutions the LLM returns (validated against the allowed email
 *      set — the LLM cannot invent emails).
 *
 * Every failure mode degrades silently to the local-only result. The
 * upload flow is never blocked on the LLM.
 */
async function applyLlmFallbacks(
  csvText: string,
  result: CsvParseResult,
): Promise<CsvParseResult> {
  if (!isLlmEnabled()) return result

  // Opportunity 1: fix missing headers
  if (result.errors.length > 0 && result.missingRequired.length > 0) {
    try {
      const llmHeaders = await llmResolveHeaders(
        result.rawHeaders,
        result.sampleRows,
      )
      if (llmHeaders) {
        // Build overrides keyed by normalized raw header, accepting only
        // high-confidence mappings (per plan — medium is flagged but not
        // auto-applied at v1).
        const overrides: Record<string, string> = {}
        for (const mapping of llmHeaders.mappings) {
          if (mapping.canonical === 'none') continue
          if (mapping.confidence !== 'high') continue
          const key = mapping.raw_header
            .toLowerCase()
            .normalize('NFD')
            .replace(/\p{Diacritic}/gu, '')
            .replace(/[^a-z0-9]/g, '')
          overrides[key] = mapping.canonical
        }

        if (Object.keys(overrides).length > 0) {
          const reparsed = parseEmployeeCsv(csvText, {
            headerOverrides: overrides,
          })
          if (reparsed.errors.length === 0) {
            // LLM fix worked — replace the result and continue to phase 2
            result = reparsed
            result.warnings = [
              ...result.warnings,
              {
                row: 0,
                message:
                  'AI fallback was used to map column headers that could not be auto-detected',
              },
            ]
          }
        }
      }
    } catch (err) {
      console.error('LLM header fallback failed (non-fatal):', err)
    }
  }

  // Opportunity 2: resolve unresolved supervisors
  if (result.unresolvedSupervisors.length > 0 && result.rows.length > 0) {
    try {
      const llmSupervisors = await llmResolveSupervisors(
        result.unresolvedSupervisors.map((u) => ({
          row_index: u.row_index,
          raw_value: u.raw_value,
          candidates: u.candidates,
        })),
      )
      if (llmSupervisors && llmSupervisors.resolutions.length > 0) {
        const allowedEmails = new Set(result.rows.map((r) => r.email))
        const unresolvedByIndex = new Map(
          result.unresolvedSupervisors.map((u) => [u.row_index, u]),
        )
        const resolvedCount = { n: 0 }

        // Patch result.rows with LLM resolutions (in-place construction
        // of a new array to stay immutable). Only apply if the returned
        // email is in the allowed set AND confidence is high or medium.
        const patchedRows = [...result.rows]
        for (const resolution of llmSupervisors.resolutions) {
          const unresolved = unresolvedByIndex.get(resolution.row_index)
          if (!unresolved) continue
          if (!resolution.resolved_email) continue
          if (resolution.confidence === 'low') continue
          if (!allowedEmails.has(resolution.resolved_email)) continue

          const row = patchedRows[resolution.row_index]
          if (!row) continue
          if (resolution.resolved_email === row.email) continue

          patchedRows[resolution.row_index] = {
            ...row,
            supervisor_email: resolution.resolved_email,
          }
          resolvedCount.n++
        }

        if (resolvedCount.n > 0) {
          result = {
            ...result,
            rows: patchedRows,
            warnings: [
              ...result.warnings,
              {
                row: 0,
                message: `AI fallback resolved ${resolvedCount.n} supervisor name${resolvedCount.n === 1 ? '' : 's'} that local fuzzy matching could not`,
              },
            ],
          }
        }
      }
    } catch (err) {
      console.error('LLM supervisor fallback failed (non-fatal):', err)
    }
  }

  return result
}
