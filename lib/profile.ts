/**
 * Server-only helpers for the employee profile editor.
 * Do NOT import this in client components — use lib/profile-schema.ts instead.
 */
import { getCurrentUserAndMembership } from './auth'
import { createClient } from './supabase/server'
import type { Employee, Organization } from './types'

// Re-export schema so server imports keep working
export { profileSchema, type ProfileFormValues } from './profile-schema'

// ---------------------------------------------------------------------------
// Server helper
// ---------------------------------------------------------------------------

export type ProfileData = {
  employee: Employee
  organization: Pick<Organization, 'id' | 'name'>
}

/**
 * Returns the claimed employee + org for the current user, or null if the user
 * has no claimed employee row in any of their orgs.
 */
export async function getProfileForCurrentUser(): Promise<ProfileData | null> {
  const auth = await getCurrentUserAndMembership()
  if (!auth || !auth.membership) return null

  const supabase = await createClient()

  const { data: employee, error } = await supabase
    .from('employees')
    .select(
      'id, organization_id, first_name, last_name, email, position, supervisor_email, context, headshot_url, linkedin_url, phone, custom_links, slack_user_id, claimed_by_user_id, created_at, updated_at',
    )
    .eq('claimed_by_user_id', auth.user.id)
    .maybeSingle()

  if (error || !employee) return null

  const { data: org } = await supabase
    .from('organizations')
    .select('id, name')
    .eq('id', auth.membership.organization_id)
    .maybeSingle()

  if (!org) return null

  return {
    employee: employee as Employee,
    organization: { id: org.id, name: org.name },
  }
}
