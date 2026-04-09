import Link from 'next/link'
import { redirect } from 'next/navigation'

import { ChartHeaderClient } from '@/components/chart/chart-header-client'
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

  // Check whether the current user has a claimed employee record
  const { data: claimedEmployee } = await supabase
    .from('employees')
    .select('id')
    .eq('claimed_by_user_id', auth.user.id)
    .maybeSingle()

  const hasClaimedEmployee = Boolean(claimedEmployee)

  const isAdmin =
    auth.membership.role === 'owner' || auth.membership.role === 'admin'

  return (
    /* Full-screen layout: header is fixed at h-14, canvas fills the rest */
    <main className="h-screen overflow-hidden bg-slate-50">
      <ChartHeaderClient
        organizationName={organization.name}
        organizationLogoUrl={organization.logo_url ?? null}
        isAdmin={isAdmin}
        hasClaimedEmployee={hasClaimedEmployee}
      />

      {roots.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center px-6 text-center">
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
          isAdmin={isAdmin}
        />
      )}
    </main>
  )
}
