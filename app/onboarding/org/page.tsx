import { redirect } from 'next/navigation'

import { Logo } from '@/components/brand/logo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createClient } from '@/lib/supabase/server'
import { createOrganization } from './actions'

/**
 * Onboarding step 1: create the organization.
 * If the user already belongs to an org, skip ahead to /chart.
 */
export default async function OnboardingOrgPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/signup?next=/onboarding/org')
  }

  const { data: existingMembership, error: membershipError } = await supabase
    .from('memberships')
    .select('id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()

  if (membershipError) {
    throw new Error('Could not load your account. Please try again.')
  }

  if (existingMembership) {
    redirect('/chart')
  }

  return (
    <main className="min-h-screen bg-white">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <Logo size="md" />
      </header>

      <div className="flex items-start justify-center px-6 pt-20">
        <div className="w-full max-w-md">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Step 1 of 2
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
            Set up your organization
          </h1>
          <p className="mt-3 text-sm text-slate-600">
            We&apos;ll use this to brand your org chart.
          </p>

          <form action={createOrganization} className="mt-8 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Organization name</Label>
              <Input
                id="name"
                name="name"
                type="text"
                required
                maxLength={100}
                placeholder="Acme, Inc."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="website_url">
                Website{' '}
                <span className="font-normal text-slate-400">(optional)</span>
              </Label>
              <Input
                id="website_url"
                name="website_url"
                type="url"
                placeholder="https://acme.com"
              />
            </div>

            <Button type="submit" className="w-full" size="lg">
              Continue
            </Button>
          </form>
        </div>
      </div>
    </main>
  )
}
