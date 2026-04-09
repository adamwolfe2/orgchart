import Papa from 'papaparse'
import { z } from 'zod'

import { expandNickname, NICKNAMES } from './csv/nicknames'
import {
  cleanCell,
  emailLocalTokens,
  firstToken,
  lastToken,
  levenshtein,
  looksLikeEmail,
  normalize,
  splitFullName,
  stripHonorifics,
} from './csv/normalize'

/**
 * Canonical employee fields. The CSV parser fuzzy-matches incoming headers
 * to one of these names so messy templates ("First Name", "Email Address",
 * "Reports To", "Job Title", etc.) all work without manual mapping.
 *
 * `full_name` is a synthetic canonical: when detected, it's split into
 * first_name + last_name during row parsing rather than stored directly.
 */
const CANONICAL_FIELDS = [
  'first_name',
  'last_name',
  'email',
  'position',
  'supervisor_email',
  'context',
  'full_name',
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
    'christianname',
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
  full_name: [
    'full_name',
    'fullname',
    'name',
    'employee',
    'employee_name',
    'employeename',
    'displayname',
    'display_name',
    'legalname',
    'legal_name',
    'personname',
    'person_name',
  ],
  email: [
    'email',
    'emailaddress',
    'email_address',
    'mail',
    'workemail',
    'work_email',
    'companyemail',
    'company_email',
    'officialemail',
    'primaryemail',
    'businessemail',
    'e_mail',
    'personalemail',
    'personal_email',
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
    'function',
    'occupation',
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
    'reportingto',
    'reporting_to',
    'reportingmanager',
    'boss',
    'bossemail',
    'boss_email',
    'parent',
    'parentemail',
    'parent_email',
    'leadby',
    'ledby',
    'head',
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
    'duties',
  ],
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
 * Match a raw header to a canonical field. Returns null if no confident
 * match. Uses exact normalized match first, then falls back to a longest-
 * substring-containment search so "Work Email Address" still resolves to
 * the "email" canonical via the "emailaddress" alias.
 */
export function matchHeader(rawHeader: string): CanonicalField | null {
  const norm = normalize(rawHeader)
  if (!norm) return null

  if (NORMALIZED_ALIASES[norm]) return NORMALIZED_ALIASES[norm]

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

export const csvRowSchema = z
  .object({
    first_name: z.string().trim().default(''),
    last_name: z.string().trim().default(''),
    email: z.string().trim().toLowerCase().email('valid email required'),
    position: z.string().trim().optional().default(''),
    supervisor_email: z.string().trim().toLowerCase().optional().default(''),
    context: z.string().trim().optional().default(''),
  })
  .superRefine((val, ctx) => {
    // Must have at least one of first_name / last_name. Single-name
    // employees (common in some cultures) are valid — we just need
    // something to display.
    if (!val.first_name && !val.last_name) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['first_name'],
        message: 'at least one of first_name or last_name is required',
      })
    }
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
  /** Row-level problems that don't block the upload. */
  warnings: CsvIssue[]
  headerMappings: HeaderMapping[]
  unmappedHeaders: string[]
  missingRequired: CanonicalField[]
}

/**
 * Required canonical fields. full_name counts as satisfying BOTH
 * first_name and last_name (it's split at parse time).
 */
const REQUIRED_FIELDS: CanonicalField[] = ['first_name', 'last_name', 'email']
const HEADER_SCAN_LIMIT = 15

/**
 * Scan the first N non-empty rows and return the index of the row that
 * looks most like a header. Skips merged-cell title rows like "MA
 * Employees" above the real header. A row containing a `full_name`
 * match is treated as satisfying BOTH first_name and last_name.
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

    // full_name satisfies both name fields for header-detection scoring
    const satisfies = new Set<CanonicalField>(fields)
    if (fields.has('full_name')) {
      satisfies.add('first_name')
      satisfies.add('last_name')
    }

    const requiredFound = REQUIRED_FIELDS.filter((f) => satisfies.has(f)).length
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
 * Fuzzy-resolve a supervisor value to an employee email.
 *
 * Tier order:
 *   1. Already an email → use as-is
 *   2. Exact normalized "firstnamelastname" match
 *   3. Levenshtein ≤2 (≤3 for long names) on normalized full name
 *   4. Nickname expansion: if the raw supervisor's first token has known
 *      nickname variants, retry tier 2 with each variant
 *   5. Last-name fuzzy match (≤1 edit) gated by same first initial or
 *      first-name prefix overlap
 *   6. Email local-part match: supervisor "Mike Hoffman" against
 *      employees whose email decomposes to matching tokens
 */
function resolveSupervisor(raw: string, staged: StagedRow[]): string | null {
  const trimmed = cleanCell(raw)
  if (!trimmed) return null
  if (looksLikeEmail(trimmed)) return trimmed.toLowerCase()

  const rawNorm = normalize(trimmed)
  if (!rawNorm) return null

  const rawFirst = normalize(firstToken(trimmed))
  const rawLast = normalize(lastToken(trimmed))
  const rawFirstVariants = expandNickname(rawFirst)

  let bestEmail: string | null = null
  let bestScore = Infinity

  for (const emp of staged) {
    const empFirst = normalize(emp.first_name)
    const empLast = normalize(emp.last_name)
    const empFull = empFirst + empLast

    // Tier 2: exact full match wins immediately
    if (empFull === rawNorm) return emp.email

    // Tier 3: Levenshtein full-name fuzzy
    const fullDist = levenshtein(rawNorm, empFull)
    const fullThreshold = empFull.length >= 12 ? 3 : 2
    if (fullDist <= fullThreshold && fullDist < bestScore) {
      bestScore = fullDist
      bestEmail = emp.email
    }

    // Tier 4: nickname expansion — retry exact match with nickname alternatives
    if (rawFirstVariants.size > 1) {
      for (const variant of rawFirstVariants) {
        if (variant === rawFirst) continue
        const expanded = variant + normalize(lastToken(trimmed))
        if (expanded === empFull) {
          // Treat as near-exact
          const score = 0.5
          if (score < bestScore) {
            bestScore = score
            bestEmail = emp.email
          }
        }
      }
      // Also try nickname-expanded LEFT side: maybe emp's first is a nickname
      // of the raw's first, OR vice versa
      const empFirstVariants = expandNickname(empFirst)
      const overlap = [...rawFirstVariants].some((v) => empFirstVariants.has(v))
      if (overlap && rawLast && empLast) {
        const lastDist = levenshtein(rawLast, empLast)
        if (lastDist <= 1) {
          const score = 0.6 + lastDist
          if (score < bestScore) {
            bestScore = score
            bestEmail = emp.email
          }
        }
      }
    }

    // Tier 5: last-name fuzzy + first initial / prefix check
    if (rawLast && empLast) {
      const lastDist = levenshtein(rawLast, empLast)
      if (lastDist <= 1) {
        const sameInitial =
          rawFirst.length > 0 &&
          empFirst.length > 0 &&
          rawFirst[0] === empFirst[0]
        const prefixMatch =
          rawFirst.length > 0 &&
          empFirst.length > 0 &&
          (rawFirst.startsWith(empFirst) || empFirst.startsWith(rawFirst))

        if (sameInitial || prefixMatch) {
          const score = lastDist + 1 + (prefixMatch ? 0 : 0.5)
          if (score < bestScore) {
            bestScore = score
            bestEmail = emp.email
          }
        }
      }
    }

    // Tier 6: email local-part tokens match first+last
    const emailTokens = emailLocalTokens(emp.email)
    if (emailTokens.length >= 1 && (rawFirst || rawLast)) {
      const tokenSet = new Set(emailTokens)
      const matchesFirst = rawFirst ? tokenSet.has(rawFirst) : false
      const matchesLast = rawLast ? tokenSet.has(rawLast) : false
      // Also check nickname variants of the first name
      const matchesFirstNickname =
        !matchesFirst &&
        [...rawFirstVariants].some((v) => tokenSet.has(v))
      if ((matchesFirst || matchesFirstNickname) && matchesLast) {
        const score = 0.8 // slightly worse than nickname match, better than last-name-only
        if (score < bestScore) {
          bestScore = score
          bestEmail = emp.email
        }
      }
    }
  }

  return bestEmail
}

/**
 * Detect cycles in the supervisor graph. Returns a list of
 * [childEmail, parentEmail] edges to break so the tree renders cleanly.
 * Strategy: DFS from each node, if we revisit a node on the current
 * stack, break the edge from the lexicographically-latest email in
 * the cycle (deterministic).
 */
function detectAndBreakCycles(rows: CsvRow[]): Array<[string, string]> {
  const edgesToBreak: Array<[string, string]> = []
  const parentOf = new Map<string, string>()
  rows.forEach((r) => {
    if (r.supervisor_email) parentOf.set(r.email, r.supervisor_email)
  })

  const WHITE = 0
  const GRAY = 1
  const BLACK = 2
  const color = new Map<string, number>()
  for (const email of parentOf.keys()) color.set(email, WHITE)

  function visit(start: string): void {
    const stack: string[] = [start]
    const pathSet = new Set<string>()
    const path: string[] = []

    // Iterative DFS following the single-parent chain
    let current: string | undefined = start
    while (current) {
      if (color.get(current) === BLACK) return
      if (pathSet.has(current)) {
        // Found a cycle — from `current` back to current in `path`
        const cycleStart = path.indexOf(current)
        const cycle = path.slice(cycleStart).concat(current)
        // Break at the lex-latest email
        let latest = cycle[0]
        for (const e of cycle) if (e > latest) latest = e
        const latestParent = parentOf.get(latest)
        if (latestParent) {
          edgesToBreak.push([latest, latestParent])
          parentOf.delete(latest)
        }
        return
      }
      pathSet.add(current)
      path.push(current)
      color.set(current, GRAY)
      const next = parentOf.get(current)
      current = next
    }
    // Mark all visited as BLACK
    for (const e of path) color.set(e, BLACK)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    void stack
  }

  for (const email of parentOf.keys()) {
    if (color.get(email) === WHITE) visit(email)
  }

  return edgesToBreak
}

/**
 * Parse a CSV string into validated employee rows.
 */
export function parseEmployeeCsv(csvText: string): CsvParseResult {
  // Strip UTF-8 BOM on the whole file
  const input = csvText.replace(/^\uFEFF/, '')

  const parsed = Papa.parse<string[]>(input, {
    header: false,
    skipEmptyLines: 'greedy',
  })
  const allRows = (parsed.data as string[][]) ?? []

  const headerIdx = findHeaderRow(allRows)
  const rawHeaders = allRows[headerIdx] ?? []

  // Build per-column mapping, first-seen-wins for duplicate canonicals.
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

  // full_name satisfies both first_name and last_name requirements
  const hasFullName = claimedFields.has('full_name')
  const effectiveClaimed = new Set<CanonicalField>(claimedFields)
  if (hasFullName) {
    effectiveClaimed.add('first_name')
    effectiveClaimed.add('last_name')
  }

  const unmappedHeaders = headerMappings
    .filter((m) => !m.canonical && m.raw !== '')
    .map((m) => m.raw)
  const missingRequired = REQUIRED_FIELDS.filter(
    (f) => !effectiveClaimed.has(f),
  )

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

  // Track last non-empty row's non-required columns for forward-fill on
  // merged-cell exports. Only applies to position / supervisor / context;
  // first_name, last_name, and email must always be explicit.
  let lastNonRequired: {
    position: string
    supervisor_email: string
    context: string
  } | null = null

  dataRows.forEach((cells, idx) => {
    const lineNum = headerIdx + idx + 2
    if (!cells || cells.every((c) => !c || c.trim() === '')) return

    const obj: Record<string, string> = {}
    for (const [field, colIdx] of fieldToCol.entries()) {
      obj[field] = cleanCell(cells[colIdx] ?? '')
    }

    // full_name split
    if (hasFullName && obj.full_name) {
      const split = splitFullName(obj.full_name)
      if (!obj.first_name) obj.first_name = split.first
      if (!obj.last_name) obj.last_name = split.last
    }

    // Per-cell "Last, First" detection: if first_name contains a comma
    // (e.g. "Doe, John") and last_name is blank, split it.
    if (obj.first_name && obj.first_name.includes(',') && !obj.last_name) {
      const split = splitFullName(obj.first_name)
      obj.first_name = split.first
      obj.last_name = split.last
    }

    // Strip honorifics from the display name pieces — we keep the cleaned
    // version so the tree UI doesn't show "Dr. John Smith Jr."
    if (obj.first_name) obj.first_name = stripHonorifics(obj.first_name)
    if (obj.last_name) obj.last_name = stripHonorifics(obj.last_name)

    // Forward-fill non-required columns when they're blank and the
    // previous row had them. Heuristic: only fill if at least one
    // required field (first_name / email) is present in the current row
    // — we don't want to promote junk rows.
    const hasAnyRequired = !!(obj.first_name || obj.last_name || obj.email)
    if (hasAnyRequired && lastNonRequired) {
      if (!obj.position) obj.position = lastNonRequired.position
      if (!obj.supervisor_email)
        obj.supervisor_email = lastNonRequired.supervisor_email
      if (!obj.context) obj.context = lastNonRequired.context
    }

    const rawSupervisor = cleanCell(obj.supervisor_email ?? '')
    // full_name is synthetic — exclude it from schema validation since
    // it's already been split into first_name / last_name above.
    const { full_name: _fullName, ...rest } = obj
    void _fullName
    const probe = { ...rest, supervisor_email: '' }

    const result = csvRowSchema.safeParse(probe)
    if (!result.success) {
      const msg = result.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')
      warnings.push({ row: lineNum, message: `row skipped — ${msg}` })
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

    // Update forward-fill state from the RAW obj (before zod normalization)
    // so the next row inherits the original casing.
    lastNonRequired = {
      position: obj.position ?? '',
      supervisor_email: rawSupervisor,
      context: obj.context ?? '',
    }
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

  // Resolve supervisor values
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

  // Cycle detection — break any cycles deterministically
  const brokenEdges = detectAndBreakCycles(rows)
  if (brokenEdges.length > 0) {
    const brokenSet = new Set(brokenEdges.map(([a, b]) => `${a}|${b}`))
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      if (
        row.supervisor_email &&
        brokenSet.has(`${row.email}|${row.supervisor_email}`)
      ) {
        warnings.push({
          row: staged[i].line,
          message: `cycle detected: "${row.email}" → "${row.supervisor_email}" — supervisor link dropped to break the cycle`,
        })
        rows[i] = { ...row, supervisor_email: '' }
      }
    }
  }

  // Cross-row sanity
  rows.forEach((row, idx) => {
    if (row.supervisor_email && !seenEmails.has(row.supervisor_email)) {
      warnings.push({
        row: staged[idx].line,
        message: `resolved supervisor_email "${row.supervisor_email}" not in the employee list`,
      })
    }
  })

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

// Re-export NICKNAMES for use in tests / LLM fallback later
export { NICKNAMES }
