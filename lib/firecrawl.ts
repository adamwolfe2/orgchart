/**
 * Firecrawl wrapper for brand extraction during onboarding.
 *
 * Phase 2: scrapes a company website, extracts logo URL and brand colors.
 * Phase 1 stub: returns null so onboarding falls back to defaults.
 */

export interface BrandExtractionResult {
  logoUrl: string | null
  primaryColor: string | null
  secondaryColor: string | null
  accentColor: string | null
}

const FIRECRAWL_API = 'https://api.firecrawl.dev/v1/scrape'

/**
 * Scrape a website with Firecrawl and return raw markdown + metadata.
 * Throws on missing API key or network errors. Caller handles fallback.
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
 * Phase 1: returns nulls (fallback to defaults).
 * Phase 2: implement using Firecrawl + OpenAI structured output.
 */
export async function extractBrand(websiteUrl: string): Promise<BrandExtractionResult> {
  // PHASE 2 TODO: implement
  // 1. const { markdown, metadata } = await scrape(websiteUrl)
  // 2. Pull logo from metadata.ogImage / favicon, fall back to /favicon.ico
  // 3. Use OpenAI 4o-mini to read markdown and identify brand colors
  // 4. Return BrandExtractionResult
  void websiteUrl
  void scrape
  return {
    logoUrl: null,
    primaryColor: null,
    secondaryColor: null,
    accentColor: null,
  }
}
