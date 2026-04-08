/**
 * Domain types for OrgChart.
 * Mirrors the Supabase schema in supabase/migrations/0001_init.sql.
 */

export type Role = 'owner' | 'admin' | 'member'

export interface Organization {
  id: string
  name: string
  slug: string
  website_url: string | null
  logo_url: string | null
  primary_color: string
  secondary_color: string
  accent_color: string
  created_at: string
  updated_at: string
}

export interface Membership {
  id: string
  user_id: string
  organization_id: string
  role: Role
  created_at: string
}

export interface Employee {
  id: string
  organization_id: string
  first_name: string
  last_name: string
  email: string
  position: string | null
  supervisor_email: string | null
  context: string | null
  headshot_url: string | null
  slack_user_id: string | null
  claimed_by_user_id: string | null
  created_at: string
  updated_at: string
}

export interface ProfileClaim {
  token: string
  organization_id: string
  employee_id: string
  email: string
  expires_at: string
  claimed_at: string | null
  created_at: string
}

/** A node in the rendered org chart tree. */
export interface EmployeeNode extends Employee {
  reports: EmployeeNode[]
}

/** Standardized API response envelope. */
export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
}
