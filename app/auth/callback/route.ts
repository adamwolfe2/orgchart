import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Supabase magic-link callback.
 * Exchanges the auth code for a session cookie, then redirects to `next`
 * (defaults to /onboarding/org). On any failure, kicks the user back to
 * /signup with an error flag.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const nextParam = searchParams.get('next')
  const next =
    nextParam && nextParam.startsWith('/') ? nextParam : '/onboarding/org'

  if (!code) {
    return NextResponse.redirect(`${origin}/signup?error=auth_failed`)
  }

  try {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (error) {
      return NextResponse.redirect(`${origin}/signup?error=auth_failed`)
    }

    return NextResponse.redirect(`${origin}${next}`)
  } catch {
    return NextResponse.redirect(`${origin}/signup?error=auth_failed`)
  }
}
