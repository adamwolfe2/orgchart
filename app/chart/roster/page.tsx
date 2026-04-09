import Link from 'next/link'
import { redirect } from 'next/navigation'

import { RosterTable } from '@/components/chart/roster-table'
import { Button } from '@/components/ui/button'
import { Logo } from '@/components/brand/logo'
import { getCurrentUserAndMembership } from '@/lib/auth'
import { getEmployeesForOrg } from '@/lib/employees'
import type { Employee } from '@/lib/types'

export const metadata = { title: 'Roster' }

export default async function RosterPage() {
  const auth = await getCurrentUserAndMembership()

  if (!auth) redirect('/signup?next=/chart/roster')
  if (!auth.membership) redirect('/onboarding/org')

  const isAdmin =
    auth.membership.role === 'owner' || auth.membership.role === 'admin'
  if (!isAdmin) redirect('/chart')

  const { organization, roots } = await getEmployeesForOrg(
    auth.membership.organization_id,
  )

  // Flatten tree → sorted flat list
  const employees: Employee[] = []
  function flatten(nodes: typeof roots) {
    for (const node of nodes) {
      const { reports: _, ...emp } = node
      employees.push(emp as Employee)
      flatten(node.reports)
    }
  }
  flatten(roots)
  employees.sort((a, b) => {
    const last = a.last_name.localeCompare(b.last_name)
    return last !== 0 ? last : a.first_name.localeCompare(b.first_name)
  })

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="flex h-14 items-center justify-between border-b border-slate-100 bg-white px-6">
        <div className="flex items-center gap-4">
          <Logo size="sm" showWordmark={false} href="/chart" />
          <div className="h-6 w-px bg-slate-200" aria-hidden="true" />
          <h1 className="text-sm font-semibold text-slate-900">{organization.name}</h1>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/chart">
            <Button variant="ghost" size="sm">
              Chart view
            </Button>
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-slate-900">Employee roster</h2>
          <p className="mt-1 text-sm text-slate-500">
            Edit context, titles, and social handles for anyone in your org.
          </p>
        </div>

        <RosterTable employees={employees} />
      </main>
    </div>
  )
}
