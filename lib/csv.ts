import Papa from 'papaparse'
import { z } from 'zod'

/**
 * Canonical employee fields. The CSV parser fuzzy-matches incoming headers
 * to one of these names so messy templates ("First Name", "Email Address",
 * "Reports To", "Job Title", etc.) all work without manual mapping.
 */
const CANONICAL_FIELDS = [
  'first_name',
  'last_name',
  'email',
  'position',
  'supervisor_email',
  'context',
] as const

type CanonicalField = (typeof CANONICAL_FIELDS)[number]

/**
 * Aliases. The matcher checks normalized strings (lowercase, alphanumeric only)
 * against this list. Order matters inside each list only for readability —
 * resolution is done by longest-substring match, not list order.
 *
 * For `email` we deliberately prefer work/company-style aliases over personal,
 * so if a sheet has both "Work Email" and "Personal Email" the work one wins
 * via first-seen-wins at the column level (see parseEmployeeCsv).
 */
const ALIASES: Record<CanonicalField, string[]> = {
  first_name: [
    'first_name',
    'firstname',
    'first',
    'givenname',
    'given_name',
    'fname',
    'f_name',
    'forename',
  ],
  last_name: [
    'last_name',
    'lastname',
    'last',
    'surname',
    'familyname',
    'family_name',
    'lname',
    'l_name',
  ],
  email: [
    'email',
    'emailaddress',
    'email_address',
    'mail',
    'workemail',
    'work_email',
    'personalemail',
    'personal_email',
    'companyemail',
    'company_email',
    'e_mail',
  ],
  position: [
    'position',
    'title',
    'jobtitle',
    'job_title',
    'role',
    'jobrole',
    'job_role',
    'jobposition',
    'job_position',
    'designation',
  ],
  supervisor_email: [
    'supervisor_email',
    'supervisoremail',
    'supervisor',
    'manager',
    'manager_email',
    'manageremail',
    'managername',
    'manager_name',
    'reports_to',
    'reportsto',
    'reportstoemail',
    'reports_to_email',
    'boss',
    'bossemail',
    'boss_email',
    'parent',
    'parentemail',
    'parent_email',
  ],
  context: [
    'context',
    'notes',
    'description',
    'about',
    'bio',
    'biography',
    'responsibilities',
    'owns',
    'whattheyown',
    'what_they_own',
    'jobdescription',
    'job_description',
    'summary',
    'details',
    'extra',
    'extrainfo',
    'extra_info',
  ],
}

/**
 * Normalize a header for fuzzy matching: lowercase, strip everything that
 * isn't a-z or 0-9. "First Name" -> "firstname", "E-Mail" -> "email",
 * "reports.to" -> "reportsto".
 */
function normalize(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, '')
}

const NORMALIZED_ALIASES: Record<string, CanonicalField> = (() => {
  const map: Record<string, CanonicalField> = {}
  for (const field of CANONICAL_FIELDS) {
    for (const alias of ALIASES[field]) {
      map[normalize(alias)] = field
    }
  }
  return map
})()

/**
 * Match a raw header to a canonical field. Returns null if no confident match.
 */
export function matchHeader(rawHeader: string): CanonicalField | null {
  const norm = normalize(rawHeader)
  if (!norm) return null

  if (NORMALIZED_ALIASES[norm]) {
    return NORMALIZED_ALIASES[norm]
  }

  let bestField: CanonicalField | null = null
  let bestLen = 0

  for (const [alias, field] of Object.entries(NORMALIZED_ALIASES)) {
    if (alias.length < 4) continue // skip tiny aliases for substring fuzziness
    const matches = norm.includes(alias) || alias.includes(norm)
    if (matches && alias.length > bestLen) {
      bestField = field
      bestLen = alias.length
    }
  }

  return bestField
}

/** Simple email shape check. Avoids pulling in a full RFC validator. */
function looksLikeEmail(s: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s)
}

/**
 * Per-row validation schema. Headers have already been canonicalized and
 * supervisor_email has already had name-to-email resolution applied upstream,
 * so here we only check that first_name/last_name/email are present + valid.
 */
export const csvRowSchema = z.object({
  first_name: z.string().trim().min(1, 'first_name is required'),
  last_name: z.string().trim().min(1, 'last_name is required'),
  email: z.string().trim().toLowerCase().email('valid email required'),
  position: z.string().trim().optional().default(''),
  supervisor_email: z.string().trim().toLowerCase().optional().default(''),
  context: z.string().trim().optional().default(''),
})

export type CsvRow = z.infer<typeof csvRowSchema>

export interface HeaderMapping {
  raw: string
  canonical: CanonicalField | null
}

export interface CsvParseResult {
  rows: CsvRow[]
  errors: Array<{ row: number; message: string }>
  headerMappings: HeaderMapping[]
  unmappedHeaders: string[]
  missingRequired: CanonicalField[]
}

const REQUIRED_FIELDS: CanonicalField[] = ['first_name', 'last_name', 'email']
const HEADER_SCAN_LIMIT = 15

/**
 * Scan the first N non-empty rows and return the index of the row that looks
 * most like a header: the one whose cells map to the most required canonical
 * fields. Falls back to row 0 if nothing scores.
 *
 * This lets us skip merged-cell title rows like "MA Employees" that sit
 * above the real header row in exported spreadsheets.
 */
function findHeaderRow(rows: string[][]): number {
  const limit = Math.min(rows.length, HEADER_SCAN_LIMIT)
  let bestIdx = 0
  let bestScore = -1
  let bestTotal = -1

  for (let i = 0; i < limit; i++) {
    const row = rows[i]
    if (!row || row.every((c) => !c || c.trim() === '')) continue

    const mapped = row.map((h) => matchHeader(h ?? ''))
    const fields = new Set(mapped.filter((f): f is CanonicalField => f !== null))
    const requiredFound = REQUIRED_FIELDS.filter((f) => fields.has(f)).length
    const totalFound = fields.size

    // Prefer more required-field matches. Tiebreak on total distinct canonical
    // fields matched (so a row with first_name + last_name + email + position
    // beats a row with just first_name + email).
    if (
      requiredFound > bestScore ||
      (requiredFound === bestScore && totalFound > bestTotal)
    ) {
      bestScore = requiredFound
      bestTotal = totalFound
      bestIdx = i
    }
  }

  return bestIdx
}

/**
 * Parse a CSV string into validated employee rows.
 *
 * Smart behaviors:
 *   - Skips pre-header junk rows (merged-cell titles, blank rows, etc.)
 *     by auto-detecting the real header row.
 *   - First-seen-wins for duplicate header->canonical collisions, so a sheet
 *     with both "Work Email" and "Personal Email" uses the work column.
 *   - Accepts the supervisor column as either an email or a full name,
 *     resolving names to emails via a second pass over the parsed rows.
 */
export function parseEmployeeCsv(csvText: string): CsvParseResult {
  const parsed = Papa.parse<string[]>(csvText, {
    header: false,
    skipEmptyLines: true,
  })
  const allRows = (parsed.data as string[][]) ?? []

  const headerIdx = findHeaderRow(allRows)
  const rawHeaders = allRows[headerIdx] ?? []

  // Build per-column mapping. First column to claim each canonical field wins;
  // subsequent columns with the same canonical are treated as unmapped so
  // their data doesn't clobber the winner.
  const claimedFields = new Set<CanonicalField>()
  const fieldToCol = new Map<CanonicalField, number>()
  const headerMappings: HeaderMapping[] = rawHeaders.map((raw, colIdx) => {
    const canonical = matchHeader(raw ?? '')
    if (canonical && !claimedFields.has(canonical)) {
      claimedFields.add(canonical)
      fieldToCol.set(canonical, colIdx)
      return { raw: (raw ?? '').trim(), canonical }
    }
    return { raw: (raw ?? '').trim(), canonical: null }
  })

  const unmappedHeaders = headerMappings
    .filter((m) => !m.canonical && m.raw !== '')
    .map((m) => m.raw)
  const missingRequired = REQUIRED_FIELDS.filter((f) => !claimedFields.has(f))

  if (missingRequired.length > 0) {
    return {
      rows: [],
      errors: [
        {
          row: 0,
          message: `missing required column(s): ${missingRequired.join(', ')}. Detected headers: ${rawHeaders.filter((h) => h && h.trim() !== '').join(', ') || '(none)'}`,
        },
      ],
      headerMappings,
      unmappedHeaders,
      missingRequired,
    }
  }

  const errors: CsvParseResult['errors'] = []
  parsed.errors.forEach((e) => {
    errors.push({ row: (e.row ?? 0) + 1, message: e.message })
  })

  const dataRows = allRows.slice(headerIdx + 1)
  const seenEmails = new Set<string>()

  // Staging: parse each data row into a provisional record, keeping the raw
  // supervisor value so we can do name-to-email resolution after we've seen
  // every row.
  interface StagedRow extends CsvRow {
    __line: number
    __supervisorRaw: string
  }
  const staged: StagedRow[] = []

  dataRows.forEach((cells, idx) => {
    const lineNum = headerIdx + idx + 2 // 1-indexed, header row is headerIdx+1
    if (!cells || cells.every((c) => !c || c.trim() === '')) return

    const obj: Record<string, string> = {}
    for (const [field, colIdx] of fieldToCol.entries()) {
      obj[field] = cells[colIdx] ?? ''
    }

    // Temporarily blank supervisor_email for zod validation (we'll fill it
    // back in from __supervisorRaw after name resolution). This keeps the
    // strict email requirement on the email column intact.
    const rawSupervisor = (obj.supervisor_email ?? '').trim()
    const probe = { ...obj, supervisor_email: '' }

    const result = csvRowSchema.safeParse(probe)
    if (!result.success) {
      const msg = result.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')
      errors.push({ row: lineNum, message: msg })
      return
    }

    const row = result.data
    if (seenEmails.has(row.email)) {
      errors.push({ row: lineNum, message: `duplicate email: ${row.email}` })
      return
    }
    seenEmails.add(row.email)

    staged.push({ ...row, __line: lineNum, __supervisorRaw: rawSupervisor })
  })

  // Build a name -> email lookup so we can resolve supervisor columns that
  // contain names ("Mike Hoffmann") instead of emails.
  const nameToEmail = new Map<string, string>()
  staged.forEach((r) => {
    const fullKey = normalize(`${r.first_name}${r.last_name}`)
    if (fullKey) nameToEmail.set(fullKey, r.email)
  })

  // Second pass: resolve supervisor_email from either email or full name.
  const rows: CsvRow[] = staged.map((s) => {
    const raw = s.__supervisorRaw
    let resolved = ''

    if (raw) {
      if (looksLikeEmail(raw)) {
        resolved = raw.toLowerCase()
      } else {
        const key = normalize(raw)
        const match = key ? nameToEmail.get(key) : undefined
        if (match) {
          resolved = match
        } else {
          errors.push({
            row: s.__line,
            message: `supervisor "${raw}" could not be matched to an employee in this file (tried email format and full-name lookup)`,
          })
        }
      }
    }

    // Strip staging-only fields before returning the final row.
    const { __line: _l, __supervisorRaw: _sr, ...base } = s
    void _l
    void _sr
    return { ...base, supervisor_email: resolved }
  })

  // Cross-row: resolved supervisor_email must exist in the email set.
  rows.forEach((row, idx) => {
    if (row.supervisor_email && !seenEmails.has(row.supervisor_email)) {
      errors.push({
        row: staged[idx].__line,
        message: `supervisor_email "${row.supervisor_email}" does not match any employee in this file`,
      })
    }
  })

  // At least one root (empty supervisor_email) is required.
  if (rows.length > 0 && !rows.some((r) => !r.supervisor_email)) {
    errors.push({
      row: 0,
      message:
        'CSV must include at least one employee with no supervisor (a top-level root)',
    })
  }

  return { rows, errors, headerMappings, unmappedHeaders, missingRequired }
}
