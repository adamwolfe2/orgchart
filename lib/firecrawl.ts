/**
 * Firecrawl wrapper for brand extraction during onboarding.
 *
 * Scrapes a company website and uses OpenAI to identify logo URL and brand
 * colors. Fully skip-able: returns all-null if FIRECRAWL_API_KEY is missing
 * or if any step fails.
 */

import { getOpenAI, CHAT_MODEL } from './openai'
import type { BrandExtractionResult } from './types'

export type { BrandExtractionResult }

const FIRECRAWL_API = 'https://api.firecrawl.dev/v1/scrape'
const MARKDOWN_CHAR_LIMIT = 6000
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/

const NULL_RESULT: BrandExtractionResult = {
  logoUrl: null,
  primaryColor: null,
  secondaryColor: null,
  accentColor: null,
}

/**
 * Validate a hex color string. Returns null when invalid.
 */
export function validateHexColor(value: unknown): string | null {
  if (typeof value !== 'string') return null
  return HEX_COLOR_RE.test(value) ? value : null
}

/**
 * Resolve a logo URL from Firecrawl metadata, falling back to /favicon.ico.
 */
export function resolveLogoUrl(
  metadata: Record<string, unknown>,
  websiteUrl: string,
): string {
  const candidates = [metadata.ogImage, metadata['og:image']]
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.length > 0) {
      return candidate
    }
    if (Array.isArray(candidate) && typeof candidate[0] === 'string' && candidate[0].length > 0) {
      return candidate[0] as string
    }
  }
  // Strip trailing slash before appending
  const base = websiteUrl.replace(/\/+$/, '')
  return `${base}/favicon.ico`
}

/**
 * Scrape a website with Firecrawl and return raw markdown + metadata.
 * Throws on network errors. Caller handles fallback.
 */
async function scrape(url: string): Promise<{
  markdown: string
  metadata: Record<string, unknown>
}> {
  const apiKey = process.env.FIRECRAWL_API_KEY
  if (!apiKey) {
    throw new Error('FIRECRAWL_API_KEY is not configured')
  }

  const res = await fetch(FIRECRAWL_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      url,
      formats: ['markdown'],
      onlyMainContent: false,
    }),
  })

  if (!res.ok) {
    throw new Error(`Firecrawl scrape failed: ${res.status} ${res.statusText}`)
  }

  const json = (await res.json()) as {
    success: boolean
    data?: { markdown?: string; metadata?: Record<string, unknown> }
    error?: string
  }

  if (!json.success || !json.data) {
    throw new Error(`Firecrawl error: ${json.error ?? 'unknown'}`)
  }

  return {
    markdown: json.data.markdown ?? '',
    metadata: json.data.metadata ?? {},
  }
}

/**
 * Extract brand identity from a company website.
 *
 * Returns all-null when FIRECRAWL_API_KEY is absent or any step fails so that
 * the onboarding brand step can be skipped gracefully.
 */
export async function extractBrand(websiteUrl: string): Promise<BrandExtractionResult> {
  const apiKey = process.env.FIRECRAWL_API_KEY
  if (!apiKey) {
    console.warn('[firecrawl] FIRECRAWL_API_KEY is not set — brand extraction skipped')
    return NULL_RESULT
  }

  try {
    const { markdown, metadata } = await scrape(websiteUrl)

    const logoUrl = resolveLogoUrl(metadata, websiteUrl)

    const truncatedMarkdown = markdown.slice(0, MARKDOWN_CHAR_LIMIT)

    const openai = getOpenAI()
    const completion = await openai.chat.completions.create({
      model: CHAT_MODEL,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'user',
          content:
            `Below is the homepage markdown for ${websiteUrl}. ` +
            'Identify the company\'s primary brand color, secondary color, and accent color as 6-digit hex codes. ' +
            'If you cannot tell, return null. ' +
            'Respond ONLY with JSON: { "primary": string|null, "secondary": string|null, "accent": string|null }\n\n' +
            truncatedMarkdown,
        },
      ],
    })

    const raw = completion.choices[0]?.message?.content ?? '{}'
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>
    } catch {
      console.error('[firecrawl] Failed to parse OpenAI color response:', raw)
      parsed = {}
    }

    return {
      logoUrl,
      primaryColor: validateHexColor(parsed.primary),
      secondaryColor: validateHexColor(parsed.secondary),
      accentColor: validateHexColor(parsed.accent),
    }
  } catch (err) {
    console.error('[firecrawl] extractBrand failed:', err)
    return NULL_RESULT
  }
}
