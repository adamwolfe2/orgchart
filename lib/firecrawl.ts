/**
 * Firecrawl wrapper for brand extraction during onboarding.
 *
 * Scrapes a company website and uses OpenAI vision to identify logo URL and
 * brand colors from a screenshot. Fully skip-able: returns all-null if
 * FIRECRAWL_API_KEY is missing or if any step fails.
 */

import { getOpenAI, CHAT_MODEL } from './openai'
import type { BrandExtractionResult } from './types'

export type { BrandExtractionResult }

const FIRECRAWL_API = 'https://api.firecrawl.dev/v1/scrape'
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
 * Scrape a website with Firecrawl and return screenshot URL, raw HTML, + metadata.
 * Throws on network errors. Caller handles fallback.
 */
async function scrape(url: string): Promise<{
  screenshotUrl: string | null
  html: string
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
      formats: ['screenshot', 'html'],
      onlyMainContent: false,
    }),
  })

  if (!res.ok) {
    throw new Error(`Firecrawl scrape failed: ${res.status} ${res.statusText}`)
  }

  const json = (await res.json()) as {
    success: boolean
    data?: {
      screenshot?: string
      html?: string
      metadata?: Record<string, unknown>
    }
    error?: string
  }

  if (!json.success || !json.data) {
    throw new Error(`Firecrawl error: ${json.error ?? 'unknown'}`)
  }

  return {
    screenshotUrl: json.data.screenshot ?? null,
    html: json.data.html ?? '',
    metadata: json.data.metadata ?? {},
  }
}

/**
 * Try to extract the actual logo URL from HTML.
 * Looks for common logo patterns before falling back to OG image.
 */
function extractLogoFromHtml(html: string, baseUrl: string): string | null {
  if (!html) return null

  // Patterns ordered by specificity
  const patterns: RegExp[] = [
    // <img ... class/id containing "logo" ...>
    /<img[^>]+(?:class|id)=["'][^"']*logo[^"']*["'][^>]+src=["']([^"']+)["']/gi,
    /<img[^>]+src=["']([^"']+)["'][^>]+(?:class|id)=["'][^"']*logo[^"']*["']/gi,
    // <img alt="logo" or alt contains org name>
    /<img[^>]+alt=["'][^"']*logo[^"']*["'][^>]+src=["']([^"']+)["']/gi,
    /<img[^>]+src=["']([^"']+)["'][^>]+alt=["'][^"']*logo[^"']*["']/gi,
    // SVG href patterns (linked logos)
    /<use[^>]+href=["']([^"']+\.svg[^"']*)["']/gi,
  ]

  const base = baseUrl.replace(/\/+$/, '')

  for (const pattern of patterns) {
    pattern.lastIndex = 0
    const match = pattern.exec(html)
    if (match?.[1]) {
      const src = match[1]
      if (src.startsWith('http')) return src
      if (src.startsWith('//')) return `https:${src}`
      if (src.startsWith('/')) return `${base}${src}`
    }
  }
  return null
}

/**
 * Validate that a URL is https: with a public hostname. Rejects private IPs,
 * localhost, and non-https schemes to prevent SSRF.
 */
export function validatePublicHttpsUrl(raw: string): boolean {
  try {
    const u = new URL(raw)
    if (u.protocol !== 'https:') return false
    const host = u.hostname.toLowerCase()
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '[::1]' ||
      host.startsWith('10.') ||
      host.startsWith('172.') ||
      host.startsWith('192.168.') ||
      host.startsWith('169.254.') ||
      host.endsWith('.local') ||
      host.endsWith('.internal')
    ) {
      return false
    }
    return true
  } catch {
    return false
  }
}

/**
 * Extract brand identity from a company website using OpenAI vision on a
 * Firecrawl screenshot. Returns all-null when FIRECRAWL_API_KEY is absent or
 * any step fails so that the onboarding brand step can be skipped gracefully.
 */
export async function extractBrand(websiteUrl: string): Promise<BrandExtractionResult> {
  const apiKey = process.env.FIRECRAWL_API_KEY
  if (!apiKey) {
    console.warn('[firecrawl] FIRECRAWL_API_KEY is not set — brand extraction skipped')
    return NULL_RESULT
  }

  if (!validatePublicHttpsUrl(websiteUrl)) {
    console.warn('[firecrawl] rejected non-https or private URL:', websiteUrl)
    return NULL_RESULT
  }

  try {
    const { screenshotUrl, html, metadata } = await scrape(websiteUrl)

    // Prefer an actual <img class="logo"> from HTML; fall back to OG image / favicon
    const logoUrl = extractLogoFromHtml(html, websiteUrl) ?? resolveLogoUrl(metadata, websiteUrl)

    // If no screenshot was returned, we can't extract colors visually
    if (!screenshotUrl) {
      console.warn('[firecrawl] no screenshot returned for:', websiteUrl)
      return { ...NULL_RESULT, logoUrl }
    }

    const openai = getOpenAI()
    const completion = await openai.chat.completions.create({
      model: CHAT_MODEL,
      temperature: 0,
      max_tokens: 200,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'You are a design analyst. Given a screenshot of a company homepage, ' +
            'identify the primary brand color (dominant UI color, e.g. nav/header/buttons), ' +
            'secondary color (subdued text or backgrounds), and accent color (CTA buttons or highlights). ' +
            'Return exact 6-digit hex codes with leading #. If a color is unclear, return null. ' +
            'Respond ONLY with JSON: { "primary": string|null, "secondary": string|null, "accent": string|null }',
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Extract brand colors from this screenshot of ${websiteUrl}:`,
            },
            {
              type: 'image_url',
              image_url: { url: screenshotUrl, detail: 'low' },
            },
          ],
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
