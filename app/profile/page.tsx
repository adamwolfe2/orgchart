import Link from 'next/link'
import { redirect } from 'next/navigation'

import { Logo } from '@/components/brand/logo'
import { Button } from '@/components/ui/button'
import { getCurrentUserAndMembership } from '@/lib/auth'
import { getProfileForCurrentUser } from '@/lib/profile'

import { ProfileForm } from './profile-form'

export const metadata = {
  title: 'Edit profile',
}

export default async function ProfilePage() {
  const auth = await getCurrentUserAndMembership()

  if (!auth) {
    redirect('/signup?next=/profile')
  }

  const profile = await getProfileForCurrentUser()

  return (
    <main className="min-h-screen bg-white">
      <header className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
        <div className="flex items-center gap-4">
          <Logo size="sm" showWordmark={false} href="/chart" />
          <div className="h-6 w-px bg-slate-200" aria-hidden="true" />
          <h1 className="text-sm font-semibold text-slate-900">Edit profile</h1>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/chart">
            <Button variant="ghost" size="sm">
              Back to chart
            </Button>
          </Link>
          <form action="/auth/signout" method="post">
            <Button type="submit" variant="ghost" size="sm">
              Sign out
            </Button>
          </form>
        </div>
      </header>

      <div className="mx-auto max-w-xl px-6 py-12">
        {profile === null ? (
          <div className="space-y-4 text-center">
            <p className="text-base text-slate-600">
              Your profile hasn&apos;t been linked yet. Ask an admin to send you an invite.
            </p>
            <Link href="/chart">
              <Button variant="outline">Back to chart</Button>
            </Link>
          </div>
        ) : (
          <ProfileForm
            employee={profile.employee}
            organizationId={profile.organization.id}
          />
        )}
      </div>
    </main>
  )
}
