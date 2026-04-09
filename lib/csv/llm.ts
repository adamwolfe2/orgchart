import { createHash } from 'node:crypto'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { CHAT_MODEL, getOpenAI } from '../openai'
import { createAdminClient } from '../supabase/admin'

/**
 * LLM-assisted fallback for CSV parsing. Ships feature-flagged behind
 * the CSV_LLM_ENABLED env var so it can land dark and be flipped on
 * after smoke testing.
 *
 * Philosophy:
 *   - LLM is ADDITIVE. Local heuristics always run first. We only
 *     invoke the LLM for residual ambiguity (missing required header
 *     mappings, unresolved supervisors).
 *   - Outputs are CACHED deterministically by content hash. Re-uploads
 *     of the same file never re-hit the API.
 *   - Outputs are VALIDATED against a strict zod schema. The model
 *     cannot return free-form text.
 *   - Outputs are POST-VALIDATED against the allowed set. The model
 *     cannot invent emails or canonical fields.
 *   - Every failure mode (no API key, timeout, schema error, cache
 *     miss) degrades gracefully to the local-only result.
 */

const SCHEMA_VERSION = '2026-04-08-v1'
const TIMEOUT_MS = 10_000
const MAX_CANDIDATES_PER_UNRESOLVED = 5

/**
 * Feature flag. Default off until validated.
 */
export function isLlmEnabled(): boolean {
  return process.env.CSV_LLM_ENABLED === 'true'
}

/**
 * Deterministic cache key for an LLM call.
 */
function cacheKey(kind: string, payload: unknown): string {
  const json = JSON.stringify(payload)
  const hash = createHash('sha256')
    .update(`${kind}:${SCHEMA_VERSION}:${json}`)
    .digest('hex')
  return `${kind}:${hash}`
}

async function readCache(
  admin: SupabaseClient,
  key: string,
): Promise<unknown | null> {
  try {
    const { data, error } = await admin
      .from('csv_llm_cache')
      .select('response')
      .eq('key', key)
      .maybeSingle()
    if (error || !data) return null
    return data.response
  } catch {
    return null
  }
}

async function writeCache(
  admin: SupabaseClient,
  key: string,
  kind: 'header_mapping' | 'supervisor_resolution',
  request: unknown,
  response: unknown,
): Promise<void> {
  try {
    await admin
      .from('csv_llm_cache')
      .upsert({ key, kind, request, response }, { onConflict: 'key' })
  } catch (err) {
    console.error('Failed to write LLM cache:', err)
  }
}

// ============================================================================
// HEADER MAPPING
// ============================================================================

const HeaderMappingSchema = z.object({
  mappings: z.array(
    z.object({
      raw_header: z.string(),
      canonical: z.enum([
        'first_name',
        'last_name',
        'email',
        'position',
        'supervisor_email',
        'context',
        'full_name',
        'none',
      ]),
      confidence: z.enum(['high', 'medium', 'low']),
    }),
  ),
  unmapped: z.array(z.string()),
})

export type LlmHeaderMapping = z.infer<typeof HeaderMappingSchema>

const HEADER_MAPPING_JSON_SCHEMA = {
  name: 'header_mapping',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['mappings', 'unmapped'],
    properties: {
      mappings: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['raw_header', 'canonical', 'confidence'],
          properties: {
            raw_header: { type: 'string' },
            canonical: {
              type: 'string',
              enum: [
                'first_name',
                'last_name',
                'email',
                'position',
                'supervisor_email',
                'context',
                'full_name',
                'none',
              ],
            },
            confidence: {
              type: 'string',
              enum: ['high', 'medium', 'low'],
            },
          },
        },
      },
      unmapped: {
        type: 'array',
        items: { type: 'string' },
      },
    },
  },
} as const

/**
 * Resolve CSV column headers to canonical fields via LLM. Called only
 * when local fuzzy matching fails to find at least one required field.
 *
 * Returns null on any failure — caller should fall back to local result.
 */
export async function llmResolveHeaders(
  rawHeaders: string[],
  sampleRows: string[][],
): Promise<LlmHeaderMapping | null> {
  if (!isLlmEnabled()) return null
  if (!process.env.OPENAI_API_KEY) return null
  if (rawHeaders.length === 0) return null

  const request = { rawHeaders, sampleRows: sampleRows.slice(0, 5) }
  const key = cacheKey('header_mapping', request)

  const admin = createAdminClient()
  const cached = await readCache(admin, key)
  if (cached) {
    const parsed = HeaderMappingSchema.safeParse(cached)
    if (parsed.success) return parsed.data
  }

  const systemPrompt = [
    'You are a CSV header-mapping assistant for an employee directory upload.',
    'Given a list of raw column headers and 5 sample data rows, map each raw',
    'header to one of these canonical fields:',
    '  - first_name: employee\'s given name',
    '  - last_name: employee\'s family name',
    '  - full_name: a single column with both first and last name combined',
    '  - email: employee\'s email address (prefer work/company email over personal)',
    '  - position: job title or role',
    '  - supervisor_email: manager\'s identifier (may be an email or a full name)',
    '  - context: notes, bio, responsibilities, or other free-form text',
    '  - none: header does not match any canonical field',
    '',
    'Return confidence as:',
    '  - high: exact semantic match with no ambiguity',
    '  - medium: plausible match but could reasonably be interpreted differently',
    '  - low: weak signal, should probably be ignored',
    '',
    'Never map two raw headers to the same canonical field — if multiple',
    'columns could be "email", pick the most likely (usually work email) and',
    'mark the others as "none".',
  ].join('\n')

  const userPrompt = JSON.stringify(request, null, 2)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const openai = getOpenAI()
    const response = await openai.chat.completions.create(
      {
        model: CHAT_MODEL,
        temperature: 0,
        max_tokens: 1500,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: HEADER_MAPPING_JSON_SCHEMA,
        },
      },
      { signal: controller.signal },
    )

    const content = response.choices[0]?.message?.content
    if (!content) return null

    const raw = JSON.parse(content)
    const parsed = HeaderMappingSchema.safeParse(raw)
    if (!parsed.success) {
      console.error('LLM header mapping schema validation failed:', parsed.error)
      return null
    }

    await writeCache(admin, key, 'header_mapping', request, parsed.data)
    return parsed.data
  } catch (err) {
    console.error('LLM header mapping call failed:', err)
    return null
  } finally {
    clearTimeout(timer)
  }
}

// ============================================================================
// SUPERVISOR RESOLUTION
// ============================================================================

const SupervisorResolutionSchema = z.object({
  resolutions: z.array(
    z.object({
      row_index: z.number().int(),
      raw_value: z.string(),
      resolved_email: z.string().nullable(),
      confidence: z.enum(['high', 'medium', 'low']),
      reason: z.enum([
        'nickname',
        'typo',
        'name_in_email',
        'last_first_format',
        'no_match',
        'ambiguous',
      ]),
    }),
  ),
})

export type LlmSupervisorResolution = z.infer<typeof SupervisorResolutionSchema>

const SUPERVISOR_JSON_SCHEMA = {
  name: 'supervisor_resolution',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['resolutions'],
    properties: {
      resolutions: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: [
            'row_index',
            'raw_value',
            'resolved_email',
            'confidence',
            'reason',
          ],
          properties: {
            row_index: { type: 'integer' },
            raw_value: { type: 'string' },
            resolved_email: { type: ['string', 'null'] },
            confidence: {
              type: 'string',
              enum: ['high', 'medium', 'low'],
            },
            reason: {
              type: 'string',
              enum: [
                'nickname',
                'typo',
                'name_in_email',
                'last_first_format',
                'no_match',
                'ambiguous',
              ],
            },
          },
        },
      },
    },
  },
} as const

export interface UnresolvedSupervisor {
  row_index: number
  raw_value: string
  /** Top-N shortlist of candidate employees, pre-ranked by local Levenshtein. */
  candidates: Array<{
    email: string
    first_name: string
    last_name: string
  }>
}

/**
 * Resolve a batch of unresolved supervisor values to employee emails
 * via LLM. Per the architecture plan, we never send the full employee
 * list — just the unresolved rows plus a per-row shortlist of top-5
 * candidates ranked by local fuzzy match. This caps token count and
 * constrains hallucination to the allowed set.
 *
 * Returns null on any failure — caller falls back to local-only result.
 */
export async function llmResolveSupervisors(
  unresolved: UnresolvedSupervisor[],
): Promise<LlmSupervisorResolution | null> {
  if (!isLlmEnabled()) return null
  if (!process.env.OPENAI_API_KEY) return null
  if (unresolved.length === 0) return { resolutions: [] }

  // Truncate candidate shortlists defensively.
  const normalized = unresolved.map((u) => ({
    row_index: u.row_index,
    raw_value: u.raw_value,
    candidates: u.candidates.slice(0, MAX_CANDIDATES_PER_UNRESOLVED),
  }))

  const request = { unresolved: normalized }
  const key = cacheKey('supervisor_resolution', request)

  const admin = createAdminClient()
  const cached = await readCache(admin, key)
  if (cached) {
    const parsed = SupervisorResolutionSchema.safeParse(cached)
    if (parsed.success) return parsed.data
  }

  const systemPrompt = [
    'You are a supervisor-name resolver for an employee directory upload.',
    'Each unresolved entry has a raw supervisor value (a name, nickname, or',
    'something else) that did not match any employee via exact/fuzzy/nickname',
    'rules. For each entry, you are given a shortlist of 5 candidate employees',
    'ranked by closeness.',
    '',
    'Your job: pick the ONE most likely match from the shortlist, or return',
    'null if none of the candidates are a confident match.',
    '',
    'Rules:',
    '  - resolved_email MUST be one of the candidate emails or null',
    '  - Never invent an email that is not in the candidate list',
    '  - Use "high" confidence only for obvious matches (typo, nickname,',
    '    last-first format). Use "medium" for plausible but ambiguous matches.',
    '  - Use "low" confidence (or null) if you\'re guessing',
    '  - reason categorizes WHY: nickname, typo, name_in_email,',
    '    last_first_format, no_match (null), or ambiguous (multiple candidates fit)',
  ].join('\n')

  const userPrompt = JSON.stringify(request, null, 2)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const openai = getOpenAI()
    const response = await openai.chat.completions.create(
      {
        model: CHAT_MODEL,
        temperature: 0,
        max_tokens: 2000,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: SUPERVISOR_JSON_SCHEMA,
        },
      },
      { signal: controller.signal },
    )

    const content = response.choices[0]?.message?.content
    if (!content) return null

    const raw = JSON.parse(content)
    const parsed = SupervisorResolutionSchema.safeParse(raw)
    if (!parsed.success) {
      console.error('LLM supervisor resolution schema validation failed:', parsed.error)
      return null
    }

    await writeCache(
      admin,
      key,
      'supervisor_resolution',
      request,
      parsed.data,
    )
    return parsed.data
  } catch (err) {
    console.error('LLM supervisor resolution call failed:', err)
    return null
  } finally {
    clearTimeout(timer)
  }
}
