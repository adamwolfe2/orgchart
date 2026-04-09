'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'

import { getCurrentUserAndMembership } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/

const saveBrandSchema = z.object({
  logo_url: z
    .string()
    .trim()
    .max(2048, 'Logo URL is too long.')
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined))
    .refine(
      (v) => {
        if (!v) return true
        try {
          const parsed = new URL(v)
          return parsed.protocol === 'http:' || parsed.protocol === 'https:'
        } catch {
          return false
        }
      },
      { message: 'Logo URL must be a valid http(s) URL.' },
    ),
  primary_color: z
    .string()
    .trim()
    .regex(HEX_COLOR_RE, 'Primary color must be a valid 6-digit hex color.'),
  secondary_color: z
    .string()
    .trim()
    .regex(HEX_COLOR_RE, 'Secondary color must be a valid 6-digit hex color.'),
  accent_color: z
    .string()
    .trim()
    .regex(HEX_COLOR_RE, 'Accent color must be a valid 6-digit hex color.'),
})

/**
 * Save brand colors and logo URL to the organization row, then advance to
 * the upload step. RLS orgs_update policy requires owner/admin role.
 */
export async function saveBrand(formData: FormData) {
  const auth = await getCurrentUserAndMembership()
  if (!auth?.membership) {
    throw new Error('You must be signed in to update your organization.')
  }

  const parsed = saveBrandSchema.safeParse({
    logo_url: formData.get('logo_url'),
    primary_color: formData.get('primary_color'),
    secondary_color: formData.get('secondary_color'),
    accent_color: formData.get('accent_color'),
  })

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]?.message ?? 'Invalid input.'
    throw new Error(firstIssue)
  }

  const { logo_url, primary_color, secondary_color, accent_color } = parsed.data

  const supabase = await createClient()
  const { error } = await supabase
    .from('organizations')
    .update({
      ...(logo_url !== undefined ? { logo_url } : {}),
      primary_color,
      secondary_color,
      accent_color,
      brand_scraped_at: new Date().toISOString(),
    })
    .eq('id', auth.membership.organization_id)

  if (error) {
    throw new Error(error.message ?? 'Could not save brand settings. Please try again.')
  }

  revalidatePath('/chart')
  revalidatePath('/onboarding/brand')
  redirect('/onboarding/upload')
}

/**
 * Skip brand extraction. Records brand_scraped_at so this step won't repeat.
 */
export async function skipBrand() {
  const auth = await getCurrentUserAndMembership()
  if (!auth?.membership) {
    throw new Error('You must be signed in to update your organization.')
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('organizations')
    .update({ brand_scraped_at: new Date().toISOString() })
    .eq('id', auth.membership.organization_id)

  if (error) {
    console.error('[brand/actions] skipBrand failed:', error)
  }

  revalidatePath('/onboarding/brand')
  redirect('/onboarding/upload')
}
