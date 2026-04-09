import type { MetadataRoute } from 'next'

function toAbsoluteUrl(raw: string): string {
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw
  return `https://${raw}`
}
const APP_URL = toAbsoluteUrl(
  process.env.NEXT_PUBLIC_APP_URL ?? 'orgchart.aimanagingservices.com',
)

/**
 * Minimal sitemap — only the public marketing surface. Every authed
 * page is intentionally excluded; the robots policy blocks them too.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()
  return [
    {
      url: APP_URL,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1,
    },
  ]
}
