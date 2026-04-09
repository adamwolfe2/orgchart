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

export function matchHeader(rawHeader: string): CanonicalField | null {
  const norm = normalize(rawHeader)
  if (!norm) return null

  if (NORMALIZED_ALIASES[norm]) {
    return NORMALIZED_ALIASES[norm]
  }

  let bestField: CanonicalField | null = null
  let bestLen = 0

  for (const [alias, field] of Object.entries(NORMALIZED_ALIASES)) {
    if (alias.length < 4) continue
    const matches = norm.includes(alias) || alias.includes(norm)
    if (matches && alias.length > bestLen) {
      bestField = field
      bestLen = alias.length
    }
  }

  return bestField
}

function looksLikeEmail(s: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s)
}

/** Classic Levenshtein edit distance. O(m*n) time, O(n) space. */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length

  const m = a.length
  const n = b.length
  let prev = new Array<number>(n + 1)
  let curr = new Array<number>(n + 1)
  for (let j = 0; j <= n; j++) prev[j] = j

  for (let i = 1; i <= m; i++) {
    curr[0] = i
    for (let j = 1; j <= n; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1
      curr[j] = Math.min(
        curr[j - 1] + 1,
        prev[j] + 1,
        prev[j - 1] + cost,
      )
    }
    const tmp = prev
    prev = curr
    curr = tmp
  }

  return prev[n]
}

function firstToken(raw: string): string {
  const tokens = raw.trim().split(/\s+/).filter(Boolean)
  return tokens[0] ?? ''
}

function lastToken(raw: string): string {
  const tokens = raw.trim().split(/\s+/).filter(Boolean)
  return tokens[tokens.length - 1] ?? ''
}

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

export interface CsvIssue {
  row: number
  message: string
}

export interface CsvParseResult {
  rows: CsvRow[]
  /** Hard errors that block the upload: missing required headers, empty file, etc. */
  errors: CsvIssue[]
  /** Row-level problems that don't block the upload: skipped rows, unresolved supervisors, etc. */
  warnings: CsvIssue[]
  headerMappings: HeaderMapping[]
  unmappedHeaders: string[]
  missingRequired: CanonicalField[]
}

const REQUIRED_FIELDS: CanonicalField[] = ['first_name', 'last_name', 'email']
const HEADER_SCAN_LIMIT = 15

/**
 * Scan the first N non-empty rows and return the index of the row that looks
 * most like a header. Skips merged-cell title rows like "MA Employees" that
 * sit above the real header row in exported spreadsheets.
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

interface StagedRow {
  first_name: string
  last_name: string
  email: string
  position: string
  context: string
  supervisorRaw: string
  line: number
}

/**
 * Fuzzy-resolve a supervisor value (which might be an email, a full name, a
 * typo'd name, or a nickname) to an employee email from the staged rows.
 *
 * Strategy, in order:
 *   1. If it already looks like an email, return as-is.
 *   2. Exact normalized "firstnamelastname" match.
 *   3. Levenshtein distance ≤ 2 on full name (handles "Hoffmann" vs "Hoffman").
 *   4. Last-name fuzzy match with first-initial check (handles "Michael" vs
 *      "Mike", "Jess" vs "Jessica").
 *
 * Returns the resolved email, or null if no confident match.
 */
function resolveSupervisor(raw: string, staged: StagedRow[]): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  if (looksLikeEmail(trimmed)) return trimmed.toLowerCase()

  const rawNorm = normalize(trimmed)
  if (!rawNorm) return null

  const rawFirst = normalize(firstToken(trimmed))
  const rawLast = normalize(lastToken(trimmed))

  let bestEmail: string | null = null
  let bestScore = Infinity

  for (const emp of staged) {
    const empFirst = normalize(emp.first_name)
    const empLast = normalize(emp.last_name)
    const empFull = empFirst + empLast

    // Tier 1: exact full match wins immediately.
    if (empFull === rawNorm) return emp.email

    // Tier 2: Levenshtein full-name fuzzy match.
    // Threshold scales slightly with length so longer names get a bit more slack.
    const fullDist = levenshtein(rawNorm, empFull)
    const fullThreshold = empFull.length >= 12 ? 3 : 2
    if (fullDist <= fullThreshold) {
      const score = fullDist
      if (score < bestScore) {
        bestScore = score
        bestEmail = emp.email
      }
    }

    // Tier 3: last-name match with first-letter sanity check. Handles
    // Mike<->Michael and Jess<->Jessica where Levenshtein on full name is
    // too far but the last name is close and the first initial agrees.
    if (rawLast && empLast) {
      const lastDist = levenshtein(rawLast, empLast)
      if (lastDist <= 1) {
        const sameInitial =
          rawFirst.length > 0 &&
          empFirst.length > 0 &&
          rawFirst[0] === empFirst[0]
        // Also accept if one first name is a prefix of the other: "Jess" prefix
        // of "Jessica", "Mike" is not a prefix of "Michael" but the initial
        // check catches it.
        const prefixMatch =
          rawFirst.length > 0 &&
          empFirst.length > 0 &&
          (rawFirst.startsWith(empFirst) || empFirst.startsWith(rawFirst))

        if (sameInitial || prefixMatch) {
          // Penalty so tier-2 exact-full wins over tier-3, but tier-3 still
          // beats a distant tier-2 match.
          const score = lastDist + 1 + (prefixMatch ? 0 : 0.5)
          if (score < bestScore) {
            bestScore = score
            bestEmail = emp.email
          }
        }
      }
    }
  }

  return bestEmail
}

/**
 * Parse a CSV string into validated employee rows.
 *
 * Smart behaviors (all designed so a messy real-world export still uploads):
 *   - Auto-skips pre-header junk rows (merged-cell titles, blanks).
 *   - First-seen-wins for duplicate header->canonical collisions (work email
 *     beats personal email).
 *   - Accepts supervisor as email, full name, typo'd name, or nickname via
 *     Levenshtein + last-name fuzzy resolution.
 *   - Row-level failures (bad email, unresolvable supervisor, duplicate email)
 *     become WARNINGS, not errors. The upload proceeds with the good rows.
 *   - Only two things block the upload: missing required columns, and zero
 *     parseable rows.
 */
export function parseEmployeeCsv(csvText: string): CsvParseResult {
  const parsed = Papa.parse<string[]>(csvText, {
    header: false,
    skipEmptyLines: true,
  })
  const allRows = (parsed.data as string[][]) ?? []

  const headerIdx = findHeaderRow(allRows)
  const rawHeaders = allRows[headerIdx] ?? []

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
      warnings: [],
      headerMappings,
      unmappedHeaders,
      missingRequired,
    }
  }

  const warnings: CsvIssue[] = []
  parsed.errors.forEach((e) => {
    warnings.push({ row: (e.row ?? 0) + 1, message: `papa: ${e.message}` })
  })

  const dataRows = allRows.slice(headerIdx + 1)
  const seenEmails = new Set<string>()
  const staged: StagedRow[] = []

  dataRows.forEach((cells, idx) => {
    const lineNum = headerIdx + idx + 2
    if (!cells || cells.every((c) => !c || c.trim() === '')) return

    const obj: Record<string, string> = {}
    for (const [field, colIdx] of fieldToCol.entries()) {
      obj[field] = cells[colIdx] ?? ''
    }

    // Strip supervisor for schema validation — we resolve it in a second pass.
    const rawSupervisor = (obj.supervisor_email ?? '').trim()
    const probe = { ...obj, supervisor_email: '' }

    const result = csvRowSchema.safeParse(probe)
    if (!result.success) {
      // Row-level validation failure: record as warning, skip the row.
      const msg = result.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')
      warnings.push({
        row: lineNum,
        message: `row skipped — ${msg}`,
      })
      return
    }

    const row = result.data
    if (seenEmails.has(row.email)) {
      warnings.push({
        row: lineNum,
        message: `row skipped — duplicate email: ${row.email}`,
      })
      return
    }
    seenEmails.add(row.email)

    staged.push({
      first_name: row.first_name,
      last_name: row.last_name,
      email: row.email,
      position: row.position,
      context: row.context,
      supervisorRaw: rawSupervisor,
      line: lineNum,
    })
  })

  if (staged.length === 0) {
    return {
      rows: [],
      errors: [
        {
          row: 0,
          message:
            'no parseable employee rows found in the file (every row was empty or malformed)',
        },
      ],
      warnings,
      headerMappings,
      unmappedHeaders,
      missingRequired,
    }
  }

  // Second pass: resolve supervisor values to employee emails via fuzzy match.
  const rows: CsvRow[] = staged.map((s) => {
    const base: CsvRow = {
      first_name: s.first_name,
      last_name: s.last_name,
      email: s.email,
      position: s.position,
      context: s.context,
      supervisor_email: '',
    }

    if (!s.supervisorRaw) return base

    const resolved = resolveSupervisor(s.supervisorRaw, staged)
    if (resolved && resolved !== s.email) {
      return { ...base, supervisor_email: resolved }
    }

    if (resolved === s.email) {
      warnings.push({
        row: s.line,
        message: `supervisor "${s.supervisorRaw}" resolved to the employee themself — treating as no supervisor`,
      })
      return base
    }

    warnings.push({
      row: s.line,
      message: `supervisor "${s.supervisorRaw}" couldn't be matched to any employee in this file — treating as top-level`,
    })
    return base
  })

  // Cross-row sanity: if a resolved supervisor_email somehow points outside
  // the seen set, warn (shouldn't happen with the resolver, but defensive).
  rows.forEach((row, idx) => {
    if (row.supervisor_email && !seenEmails.has(row.supervisor_email)) {
      warnings.push({
        row: staged[idx].line,
        message: `resolved supervisor_email "${row.supervisor_email}" not in the employee list`,
      })
    }
  })

  // If nothing has an empty supervisor, we have no root. Warn but don't block —
  // the tree renderer will just show a disconnected set.
  if (rows.length > 0 && !rows.some((r) => !r.supervisor_email)) {
    warnings.push({
      row: 0,
      message:
        'no top-level employee found (no row with an empty supervisor). The chart will render as disconnected trees.',
    })
  }

  return {
    rows,
    errors: [],
    warnings,
    headerMappings,
    unmappedHeaders,
    missingRequired,
  }
}
