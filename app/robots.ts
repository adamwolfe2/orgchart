import type { MetadataRoute } from 'next'

function toAbsoluteUrl(raw: string): string {
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw
  return `https://${raw}`
}
const APP_URL = toAbsoluteUrl(
  process.env.NEXT_PUBLIC_APP_URL ?? 'orgchart.aimanagingservices.com',
)

/**
 * Robots policy. Marketing surfaces are crawlable. Every authed
 * surface (onboarding, chart, auth callbacks, API) is blocked so we
 * don't leak org data or serve half-rendered auth-required pages to
 * search engines.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/'],
        disallow: [
          '/api/',
          '/auth/',
          '/chart',
          '/onboarding/',
          '/signup',
        ],
      },
    ],
    sitemap: `${APP_URL}/sitemap.xml`,
  }
}
