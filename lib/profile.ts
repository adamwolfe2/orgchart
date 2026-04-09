/**
 * Server-only helpers for the employee profile editor.
 * Do NOT import this in client components.
 */
import { z } from 'zod'

import { getCurrentUserAndMembership } from './auth'
import { createClient } from './supabase/server'
import type { Employee, Organization } from './types'

// ---------------------------------------------------------------------------
// Validation schema — exported so the client form can reuse it
// ---------------------------------------------------------------------------

const customLinkSchema = z.object({
  label: z.string().min(1, 'Label is required').max(50, 'Label must be 50 characters or fewer'),
  url: z
    .string()
    .url('Must be a valid URL')
    .regex(/^https?:\/\//, 'Must start with http:// or https://'),
})

export const profileSchema = z.object({
  position: z
    .string()
    .max(200, 'Position must be 200 characters or fewer')
    .optional()
    .or(z.literal('')),
  context: z
    .string()
    .max(2000, 'Context must be 2000 characters or fewer')
    .optional()
    .or(z.literal('')),
  linkedin_url: z
    .string()
    .optional()
    .or(z.literal(''))
    .refine(
      (val) => {
        if (!val || val.trim() === '') return true
        return /^https:\/\/(?:www\.)?linkedin\.com\//.test(val)
      },
      { message: 'Must be a LinkedIn URL (https://...linkedin.com/...)' },
    ),
  phone: z
    .string()
    .max(50, 'Phone must be 50 characters or fewer')
    .optional()
    .or(z.literal('')),
  // Required (not optional) so the field type stays consistent between input/output.
  // The form always initialises this to an array (possibly empty).
  custom_links: z
    .array(customLinkSchema)
    .max(10, 'Maximum 10 custom links allowed'),
})

export type ProfileFormValues = z.infer<typeof profileSchema>

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
    .select('*')
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
