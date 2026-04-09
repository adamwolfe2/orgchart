import type { NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

/**
 * Runs on every matched request to refresh the Supabase session cookie.
 * Without this, access tokens expire after 1 hour and users are forced
 * to re-authenticate via magic link on every visit.
 *
 * updateSession() calls supabase.auth.getUser() which silently refreshes
 * the access token using the long-lived refresh token stored in the cookie,
 * then writes the updated cookie back in the response.
 */
export async function middleware(request: NextRequest) {
  return updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Run on all paths except:
     * - _next/static  (static assets)
     * - _next/image   (image optimization)
     * - favicon.ico, robots.txt, sitemap.xml
     * - public files with extensions (.png, .svg, etc.)
     */
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff2?)$).*)',
  ],
}
