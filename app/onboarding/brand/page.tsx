import { redirect } from 'next/navigation'

import { Logo } from '@/components/brand/logo'
import { FallingPattern } from '@/components/ui/falling-pattern'
import { createClient } from '@/lib/supabase/server'
import type { Organization } from '@/lib/types'
import { BrandStep } from './brand-step'

/**
 * Onboarding step 2: extract brand colors from the org's website.
 *
 * Auto-skips to /onboarding/upload when:
 *  - The org has no website_url set (user didn't enter one in step 1)
 *  - brand_scraped_at is already set (user already completed or skipped this step)
 */
export default async function OnboardingBrandPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/signup?next=/onboarding/brand')
  }

  const { data: membership, error: membershipError } = await supabase
    .from('memberships')
    .select('organization_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()

  if (membershipError) {
    throw new Error('Could not load your account. Please try again.')
  }

  if (!membership) {
    redirect('/onboarding/org')
  }

  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .select(
      'id, name, slug, website_url, logo_url, primary_color, secondary_color, accent_color, brand_scraped_at, created_at, updated_at',
    )
    .eq('id', membership.organization_id)
    .maybeSingle()

  if (orgError) {
    throw new Error('Could not load your organization. Please try again.')
  }

  if (!org) {
    redirect('/onboarding/org')
  }

  const organization = org as Organization

  // Skip this step if brand has already been scraped or no website was provided
  if (organization.brand_scraped_at !== null || !organization.website_url) {
    redirect('/onboarding/upload')
  }

  return (
    <main className="relative isolate min-h-screen bg-white">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      >
        <FallingPattern
          className="h-full w-full [mask-image:radial-gradient(ellipse_at_top,black_50%,transparent_100%)]"
          density={1.25}
          duration={300}
          blurIntensity="0.7em"
        />
      </div>
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <Logo size="md" />
      </header>

      <div className="flex items-start justify-center px-6 pt-20">
        <div className="w-full max-w-md">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Step 2 of 3
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
            Brand your org chart
          </h1>
          <p className="mt-3 text-sm text-slate-600">
            We found your website. Confirm or adjust the colors and logo below.
          </p>

          <div className="mt-8">
            <BrandStep organization={organization} />
          </div>
        </div>
      </div>
    </main>
  )
}
