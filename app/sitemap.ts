import type { MetadataRoute } from 'next'

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? 'https://orgchart.aimanagingservices.com'

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
