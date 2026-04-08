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
 * against this list. Order matters: more specific aliases first so e.g.
 * "supervisor email" wins over generic "email".
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
    'reports_to',
    'reportsto',
    'reportstoemail',
    'reports_to_email',
    'boss',
    'bossemail',
    'boss_email',
    'managername',
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
 *
 * Strategy:
 *   1. Exact normalized match against the alias map (handles 95% of cases).
 *   2. Substring containment: header normalized contains alias OR vice versa.
 *      Picks the LONGEST matching alias to avoid "email" winning over
 *      "supervisoremail" when the header is "supervisor_email_address".
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

/** Per-row validation schema. Headers have already been canonicalized. */
export const csvRowSchema = z.object({
  first_name: z.string().trim().min(1, 'first_name is required'),
  last_name: z.string().trim().min(1, 'last_name is required'),
  email: z.string().trim().toLowerCase().email('valid email required'),
  position: z.string().trim().optional().default(''),
  supervisor_email: z
    .string()
    .trim()
    .toLowerCase()
    .optional()
    .default('')
    .refine(
      (v) => v === '' || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v),
      'supervisor_email must be a valid email or blank',
    ),
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

/**
 * Parse a CSV string into validated employee rows.
 * Returns rows + per-row errors + header mappings (does not throw).
 */
export function parseEmployeeCsv(csvText: string): CsvParseResult {
  // First pass: read raw headers so we can build the canonical mapping.
  const headerProbe = Papa.parse<string[]>(csvText, {
    header: false,
    skipEmptyLines: true,
    preview: 1,
  })

  const rawHeaders: string[] = (headerProbe.data[0] as string[] | undefined) ?? []

  const headerMappings: HeaderMapping[] = rawHeaders.map((raw) => ({
    raw: raw.trim(),
    canonical: matchHeader(raw),
  }))

  const unmappedHeaders = headerMappings
    .filter((m) => !m.canonical)
    .map((m) => m.raw)

  const mappedFields = new Set(
    headerMappings.map((m) => m.canonical).filter((f): f is CanonicalField => f !== null),
  )
  const missingRequired = REQUIRED_FIELDS.filter((f) => !mappedFields.has(f))

  // If a required column is missing, return early with a clear report.
  if (missingRequired.length > 0) {
    return {
      rows: [],
      errors: [
        {
          row: 0,
          message: `missing required column(s): ${missingRequired.join(', ')}. Detected headers: ${rawHeaders.join(', ') || '(none)'}`,
        },
      ],
      headerMappings,
      unmappedHeaders,
      missingRequired,
    }
  }

  // Build a per-row transformer that renames raw headers to canonical names.
  // We do this by indexing rows array-style then re-keying.
  const parsed = Papa.parse<string[]>(csvText, {
    header: false,
    skipEmptyLines: true,
  })

  const errors: CsvParseResult['errors'] = []
  const rows: CsvRow[] = []
  const seenEmails = new Set<string>()

  parsed.errors.forEach((e) => {
    errors.push({ row: (e.row ?? 0) + 1, message: e.message })
  })

  // First row is the header. Skip it.
  const dataRows = (parsed.data as string[][]).slice(1)

  dataRows.forEach((cells, idx) => {
    const lineNum = idx + 2 // header is line 1
    if (!cells || cells.every((c) => !c || c.trim() === '')) return

    const obj: Record<string, string> = {}
    headerMappings.forEach((mapping, colIdx) => {
      if (mapping.canonical) {
        obj[mapping.canonical] = cells[colIdx] ?? ''
      }
    })

    const result = csvRowSchema.safeParse(obj)
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
    rows.push(row)
  })

  // Cross-row validation: every supervisor_email must exist in the file (or be blank).
  rows.forEach((row, idx) => {
    if (row.supervisor_email && !seenEmails.has(row.supervisor_email)) {
      errors.push({
        row: idx + 2,
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
