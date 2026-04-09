import { redirect } from 'next/navigation'

import { Logo } from '@/components/brand/logo'
import { FallingPattern } from '@/components/ui/falling-pattern'
import { createClient } from '@/lib/supabase/server'
import { UploadForm } from './upload-form'

/**
 * Onboarding step 2: upload an employee CSV.
 * Requires an existing membership; otherwise sends the user back to step 1.
 */
export default async function OnboardingUploadPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/signup?next=/onboarding/upload')
  }

  const { data: membership, error: membershipError } = await supabase
    .from('memberships')
    .select('id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()

  if (membershipError) {
    throw new Error('Could not load your account. Please try again.')
  }

  if (!membership) {
    redirect('/onboarding/org')
  }

  return (
    <main className="relative isolate min-h-screen bg-white">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      >
        <FallingPattern
          className="h-full w-full opacity-50 [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]"
          density={3}
          duration={400}
          blurIntensity="1.5em"
        />
      </div>
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <Logo size="md" />
      </header>

      <div className="flex items-start justify-center px-6 pt-20">
        <div className="w-full max-w-md">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Step 2 of 2
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
            Upload your team
          </h1>
          <p className="mt-3 text-sm text-slate-600">
            Download the template, fill in your employees, then upload it back.
          </p>

          <div className="mt-6">
            <a
              href="/orgchart-template.csv"
              download
              className="text-sm font-medium text-slate-600 underline-offset-4 hover:text-slate-900 hover:underline"
            >
              Download CSV template
            </a>
          </div>

          <div className="mt-8">
            <UploadForm />
          </div>
        </div>
      </div>
    </main>
  )
}
