import { createClient } from '@supabase/supabase-js'

/**
 * Supabase service-role client. BYPASSES ROW LEVEL SECURITY.
 *
 * Use ONLY in server-side code (route handlers, server actions) for operations
 * that require elevated privileges, such as:
 *   - Bulk CSV employee imports (RLS would require many round-trips)
 *   - Creating profile_claims rows (no read policy exists for clients)
 *   - Validating claim tokens
 *
 * NEVER expose this client to the browser. NEVER call from "use client" code.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY',
    )
  }

  return createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
