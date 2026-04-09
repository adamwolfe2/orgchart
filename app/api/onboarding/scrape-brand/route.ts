import { NextResponse } from 'next/server'
import { z } from 'zod'

import { getCurrentUserAndMembership } from '@/lib/auth'
import { extractBrand } from '@/lib/firecrawl'
import type { ApiResponse, BrandExtractionResult } from '@/lib/types'

const bodySchema = z.object({
  website_url: z.string().url('website_url must be a valid URL'),
})

function isAdmin(role: string) {
  return role === 'owner' || role === 'admin'
}

/**
 * POST /api/onboarding/scrape-brand
 *
 * Scrapes a company website and returns extracted brand colors + logo URL.
 * Non-fatal: fields may be null if extraction fails or key is missing.
 * Requires an authenticated admin/owner membership.
 */
export async function POST(request: Request) {
  try {
    const auth = await getCurrentUserAndMembership()

    if (!auth || !auth.membership) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'unauthorized' },
        { status: 401 },
      )
    }

    if (!isAdmin(auth.membership.role)) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'forbidden: admin role required' },
        { status: 403 },
      )
    }

    const rawBody = await request.json().catch(() => null)
    const parsed = bodySchema.safeParse(rawBody ?? {})

    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? 'invalid request'
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: message },
        { status: 400 },
      )
    }

    const result = await extractBrand(parsed.data.website_url)

    return NextResponse.json<ApiResponse<BrandExtractionResult>>({
      success: true,
      data: result,
    })
  } catch (err) {
    console.error('[scrape-brand] unexpected error:', err)
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'internal server error' },
      { status: 500 },
    )
  }
}
