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
  brand_scraped_at: string | null
  created_at: string
  updated_at: string
}

/** A custom contact link on an employee profile. */
export interface EmployeeCustomLink {
  label: string
  url: string
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
  linkedin_url: string | null
  phone: string | null
  custom_links: EmployeeCustomLink[]
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

/** An admin-generated join link for an organization. */
export interface OrganizationInvite {
  id: string
  organization_id: string
  token: string
  created_by: string | null
  /** null = unlimited uses */
  max_uses: number | null
  used_count: number
  /** null = no expiration */
  expires_at: string | null
  revoked_at: string | null
  created_at: string
}

/** An employee reference stored in chat_messages.sources jsonb. */
export interface ChatSource {
  id: string
  first_name: string
  last_name: string
  position: string | null
  email: string
  headshot_url: string | null
}

/** A persisted chat message row. */
export interface ChatMessage {
  id: string
  organization_id: string
  user_id: string
  role: 'user' | 'assistant'
  content: string
  sources: ChatSource[]
  created_at: string
}
