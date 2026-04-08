import Link from 'next/link'
import { redirect } from 'next/navigation'

import { Logo } from '@/components/brand/logo'
import { OrgChartTree } from '@/components/org-chart/tree'
import { Button } from '@/components/ui/button'
import { getCurrentUserAndMembership } from '@/lib/auth'
import { getEmployeesForOrg } from '@/lib/employees'

export default async function ChartPage() {
  const auth = await getCurrentUserAndMembership()

  if (!auth) {
    redirect('/signup?next=/chart')
  }

  if (!auth.membership) {
    redirect('/onboarding/org')
  }

  const { organization, roots } = await getEmployeesForOrg(
    auth.membership.organization_id,
  )

  return (
    <main className="min-h-screen bg-white">
      <header className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
        <div className="flex items-center gap-4">
          <Logo size="sm" showWordmark={false} href="/chart" />
          <div className="h-6 w-px bg-slate-200" aria-hidden="true" />
          <h1 className="text-sm font-semibold text-slate-900">
            {organization.name}
          </h1>
        </div>
        <form action="/auth/signout" method="post">
          <Button type="submit" variant="ghost" size="sm">
            Sign out
          </Button>
        </form>
      </header>

      {roots.length === 0 ? (
        <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
          <p className="text-base text-slate-600">
            No employees yet. Upload a CSV to get started.
          </p>
          <Link href="/onboarding/upload" className="mt-6">
            <Button size="lg">Upload CSV</Button>
          </Link>
        </div>
      ) : (
        <OrgChartTree roots={roots} />
      )}
    </main>
  )
}
