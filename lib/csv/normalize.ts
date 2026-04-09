/**
 * Shared string normalization + tokenization helpers for CSV parsing.
 *
 * These functions are intentionally pure, fast, and dependency-free so
 * they can be called from tight loops in the parser without concern.
 */

const HONORIFIC_PREFIX = /^(dr|mr|ms|mrs|miss|prof|sir|lady|rev|fr)\.?\s+/i
const HONORIFIC_SUFFIX =
  /[\s,]+(jr|sr|ii|iii|iv|v|phd|md|esq|cpa|dds|dvm|mba|edd|pmp)\.?$/i

/**
 * Strip a leading BOM and trim standard whitespace, non-breaking spaces,
 * and zero-width characters from both ends of a string.
 */
export function cleanCell(s: string): string {
  if (!s) return ''
  return s
    .replace(/^\uFEFF/, '')
    .replace(/[\u200B-\u200D\u2060\u00A0]/g, ' ')
    .trim()
}

/**
 * Strip leading honorifics ("Dr.", "Mr.", "Mrs.") and trailing suffixes
 * ("Jr.", "III", "PhD", "MD") from a full-name string. Preserves the
 * underlying name for matching purposes; does NOT mutate what we store
 * for display.
 */
export function stripHonorifics(s: string): string {
  if (!s) return ''
  let out = s
  // Loop in case of both prefix and suffix, or stacked suffixes ("Jr. PhD")
  for (let i = 0; i < 3; i++) {
    const before = out
    out = out.replace(HONORIFIC_PREFIX, '').replace(HONORIFIC_SUFFIX, '')
    if (out === before) break
  }
  return out.trim()
}

/**
 * Normalize a string for fuzzy matching:
 *   1. Clean (BOM, zero-width, whitespace)
 *   2. Strip honorifics + suffixes
 *   3. Lowercase
 *   4. NFD-decompose and strip combining diacritic marks
 *      (José → jose, Zoë → zoe, Renée → renee)
 *   5. Keep only [a-z0-9]
 *
 * This is the canonical normalizer used everywhere we compare names.
 */
export function normalize(s: string): string {
  if (!s) return ''
  return stripHonorifics(cleanCell(s))
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]/g, '')
}

/**
 * Split a full-name string into first/last tokens. Handles:
 *   - "John Smith"           → { first: 'John', last: 'Smith' }
 *   - "Smith, John"          → { first: 'John', last: 'Smith' }
 *   - "John"                 → { first: 'John', last: '' }
 *   - "John van der Berg"    → { first: 'John', last: 'van der Berg' }
 *   - "Dr. John Smith Jr."   → { first: 'John', last: 'Smith' }
 */
export function splitFullName(raw: string): { first: string; last: string } {
  const cleaned = stripHonorifics(cleanCell(raw))
  if (!cleaned) return { first: '', last: '' }

  // "Last, First" format
  if (cleaned.includes(',')) {
    const [last, first] = cleaned.split(',', 2).map((s) => s.trim())
    return { first: first ?? '', last: last ?? '' }
  }

  // "First Last" / "First Middle Last" / single name
  const parts = cleaned.split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { first: '', last: '' }
  if (parts.length === 1) return { first: parts[0], last: '' }
  return {
    first: parts[0],
    last: parts.slice(1).join(' '),
  }
}

/**
 * First whitespace-separated token of a cleaned string.
 */
export function firstToken(raw: string): string {
  const parts = cleanCell(stripHonorifics(raw)).split(/\s+/).filter(Boolean)
  return parts[0] ?? ''
}

/**
 * Last whitespace-separated token of a cleaned string.
 */
export function lastToken(raw: string): string {
  const parts = cleanCell(stripHonorifics(raw)).split(/\s+/).filter(Boolean)
  return parts[parts.length - 1] ?? ''
}

/** Simple email shape check. Cheap RFC-approximate. */
export function looksLikeEmail(s: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s)
}

/**
 * Extract the local-part of an email (before the @) and split on common
 * separators ('.', '_', '-', '+'). Returns normalized tokens suitable
 * for matching against employee first/last names.
 *
 * Example: "mike.hoffman@example.com" → ["mike", "hoffman"]
 */
export function emailLocalTokens(email: string): string[] {
  if (!email || !email.includes('@')) return []
  const local = email.split('@')[0] ?? ''
  return local
    .toLowerCase()
    .split(/[._\-+]+/)
    .filter(Boolean)
}

/**
 * Classic Levenshtein edit distance. O(m*n) time, O(n) space.
 * Fast enough for fuzzy-matching names in a tight loop.
 */
export function levenshtein(a: string, b: string): number {
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
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost)
    }
    const tmp = prev
    prev = curr
    curr = tmp
  }

  return prev[n]
}
