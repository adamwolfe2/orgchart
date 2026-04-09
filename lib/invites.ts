/**
 * Server-only helpers for organization invite links.
 * This module must never be imported from "use client" code.
 */
import { randomBytes } from 'crypto'

import { createClient } from './supabase/server'
import type { OrganizationInvite } from './types'

/**
 * Generates a cryptographically random, URL-safe token (43 chars, base64url).
 * Uses 32 random bytes → 256 bits of entropy.
 */
export function generateInviteToken(): string {
  return randomBytes(32).toString('base64url')
}

/**
 * Returns up to 50 invites for the given org, newest first.
 * Uses the RLS-bound server client — caller must be authenticated as
 * an org owner/admin for the invites_admin_rw policy to permit access.
 */
export async function listInvitesForOrg(
  organizationId: string,
): Promise<OrganizationInvite[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('organization_invites')
    .select(
      'id, organization_id, token, created_by, max_uses, used_count, expires_at, revoked_at, created_at',
    )
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    throw new Error(`Failed to list invites: ${error.message}`)
  }

  return (data ?? []) as OrganizationInvite[]
}
