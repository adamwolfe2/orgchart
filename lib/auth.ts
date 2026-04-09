import { createClient } from './supabase/server'
import type { Role } from './types'

/** Check if a role has admin-level access (owner or admin). */
export function isAdmin(role: string): boolean {
  return role === 'owner' || role === 'admin'
}

/**
 * Auth helper used by API route handlers.
 *
 * Loads the current Supabase user (RLS-bound) and their first membership.
 * Returns null when no user is authenticated.
 *
 * Note: Phase 1 MVP assumes a user belongs to a single organization. We
 * intentionally `.limit(1)` and return the first membership.
 */
export async function getCurrentUserAndMembership() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const { data: memberships } = await supabase
    .from('memberships')
    .select('id, organization_id, role')
    .eq('user_id', user.id)
    .limit(1)

  const membership =
    (memberships?.[0] as {
      id: string
      organization_id: string
      role: Role
    } | undefined) ?? null

  return { user, membership }
}
