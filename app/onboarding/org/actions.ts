'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const organizationSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Organization name is required.')
    .max(100, 'Organization name must be 100 characters or fewer.'),
  website_url: z
    .string()
    .trim()
    .max(2048, 'Website URL is too long.')
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined))
    .refine(
      (value) => {
        if (!value) return true
        try {
          const parsed = new URL(value)
          return parsed.protocol === 'http:' || parsed.protocol === 'https:'
        } catch {
          return false
        }
      },
      { message: 'Website must be a valid http(s) URL.' },
    ),
})

const SLUG_SUFFIX_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'

function randomSlugSuffix(length = 4): string {
  let suffix = ''
  for (let i = 0; i < length; i += 1) {
    const index = Math.floor(Math.random() * SLUG_SUFFIX_ALPHABET.length)
    suffix += SLUG_SUFFIX_ALPHABET[index]
  }
  return suffix
}

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

  const safeBase = base.length > 0 ? base.slice(0, 48) : 'org'
  return `${safeBase}-${randomSlugSuffix()}`
}

/**
 * Server action: create an organization for the current user and make them
 * the owner. Uses the service-role admin client to avoid RLS round trips
 * during the bootstrap insert pair.
 */
export async function createOrganization(formData: FormData) {
  const supabase = await createClient()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    throw new Error('You must be signed in to create an organization.')
  }

  const parsed = organizationSchema.safeParse({
    name: formData.get('name'),
    website_url: formData.get('website_url'),
  })

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]?.message ?? 'Invalid input.'
    throw new Error(firstIssue)
  }

  const { name, website_url } = parsed.data
  const slug = slugify(name)

  const admin = createAdminClient()

  const { data: organization, error: orgInsertError } = await admin
    .from('organizations')
    .insert({
      name,
      slug,
      website_url: website_url ?? null,
    })
    .select('id')
    .single()

  if (orgInsertError || !organization) {
    throw new Error(
      orgInsertError?.message ?? 'Could not create organization. Please try again.',
    )
  }

  const { error: membershipInsertError } = await admin
    .from('memberships')
    .insert({
      user_id: user.id,
      organization_id: organization.id,
      role: 'owner',
    })

  if (membershipInsertError) {
    // Roll back the organization to keep state consistent.
    await admin.from('organizations').delete().eq('id', organization.id)
    throw new Error(
      membershipInsertError.message ??
        'Could not finish setting up your organization. Please try again.',
    )
  }

  revalidatePath('/chart')
  redirect('/onboarding/upload')
}
