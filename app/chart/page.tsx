import Link from 'next/link'
import { redirect } from 'next/navigation'

import { Logo } from '@/components/brand/logo'
import { ChartWithModal } from '@/components/org-chart/chart-with-modal'
import { Button } from '@/components/ui/button'
import { getCurrentUserAndMembership } from '@/lib/auth'
import { getEmployeesForOrg } from '@/lib/employees'
import { createClient } from '@/lib/supabase/server'
import type { ChatMessage, Employee } from '@/lib/types'

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

  // Fetch last 50 chat messages for the current user (RLS scoped to own messages)
  const supabase = await createClient()
  const { data: messageRows } = await supabase
    .from('chat_messages')
    .select('id, organization_id, user_id, role, content, sources, created_at')
    .eq('organization_id', auth.membership.organization_id)
    .eq('user_id', auth.user.id)
    .order('created_at', { ascending: true })
    .limit(50)

  const initialMessages: ChatMessage[] = (messageRows ?? []) as ChatMessage[]

  // Build an id→employee map so chat citation chips can open the modal
  const employeesById: Record<string, Employee> = {}
  function flattenRoots(nodes: typeof roots) {
    for (const node of nodes) {
      const { reports: _, ...emp } = node
      employeesById[emp.id] = emp as Employee
      flattenRoots(node.reports)
    }
  }
  flattenRoots(roots)

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
        <ChartWithModal
          roots={roots}
          employeesById={employeesById}
          initialMessages={initialMessages}
          organizationName={organization.name}
        />
      )}
    </main>
  )
}
