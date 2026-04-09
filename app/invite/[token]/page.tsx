import Link from 'next/link'

import { AcceptInviteClient } from '@/components/invite/accept-invite-client'
import { Logo } from '@/components/brand/logo'
import { Button } from '@/components/ui/button'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import type { OrganizationInvite } from '@/lib/types'

interface InviteWithOrg extends OrganizationInvite {
  organizations: {
    id: string
    name: string
    logo_url: string | null
    primary_color: string
  }
}

interface PageProps {
  params: Promise<{ token: string }>
}

function InvalidInvitePage({ reason }: { reason: string }) {
  return (
    <main className="min-h-screen bg-white">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <Logo size="md" />
      </header>
      <div className="flex items-start justify-center px-6 pt-20">
        <div className="w-full max-w-md text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            This invite is no longer valid
          </h1>
          <p className="mt-3 text-sm text-slate-600">{reason}</p>
          <Link href="/signup" className="mt-8 inline-block">
            <Button variant="outline">Go to sign in</Button>
          </Link>
        </div>
      </div>
    </main>
  )
}

export default async function InvitePage({ params }: PageProps) {
  const { token } = await params

  // Look up the invite + organization via admin client — no public RLS read policy
  const adminClient = createAdminClient()
  const { data: row } = await adminClient
    .from('organization_invites')
    .select('*, organizations!inner(id, name, logo_url, primary_color)')
    .eq('token', token)
    .maybeSingle()

  const invite = row as InviteWithOrg | null

  if (!invite) {
    return <InvalidInvitePage reason="This invite link does not exist or has been removed." />
  }

  if (invite.revoked_at) {
    return <InvalidInvitePage reason="This invite link has been revoked by an administrator." />
  }

  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    return <InvalidInvitePage reason="This invite link has expired." />
  }

  if (invite.max_uses !== null && invite.used_count >= invite.max_uses) {
    return <InvalidInvitePage reason="This invite link has reached its maximum number of uses." />
  }

  // Check if the current visitor is authenticated
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const isAuthenticated = Boolean(user)

  const organization = invite.organizations

  // Exclude the token from what we pass to the client (the AcceptInviteClient
  // receives token separately, so it can POST it — this is fine since the token
  // is in the URL already).
  const inviteForClient: OrganizationInvite = {
    id: invite.id,
    organization_id: invite.organization_id,
    token: invite.token,
    created_by: invite.created_by,
    max_uses: invite.max_uses,
    used_count: invite.used_count,
    expires_at: invite.expires_at,
    revoked_at: invite.revoked_at,
    created_at: invite.created_at,
  }

  return (
    <main className="min-h-screen bg-white">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <Logo size="md" />
      </header>
      <div className="flex items-start justify-center px-6 pt-20">
        <AcceptInviteClient
          invite={inviteForClient}
          organization={organization}
          isAuthenticated={isAuthenticated}
          token={token}
        />
      </div>
    </main>
  )
}
