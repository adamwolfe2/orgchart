'use client'

import Link from 'next/link'
import { useState } from 'react'

import { Logo } from '@/components/brand/logo'
import { Button } from '@/components/ui/button'
import { InviteDialog } from './invite-dialog'

interface ChartHeaderClientProps {
  organizationName: string
  isAdmin: boolean
  hasClaimedEmployee: boolean
}

/**
 * Client component that owns the invite-dialog open state.
 * Renders the full chart header so it can control the dialog without
 * hoisting state into the server component.
 */
export function ChartHeaderClient({
  organizationName,
  isAdmin,
  hasClaimedEmployee,
}: ChartHeaderClientProps) {
  const [inviteOpen, setInviteOpen] = useState(false)

  return (
    <>
      <header className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
        <div className="flex items-center gap-4">
          <Logo size="sm" showWordmark={false} href="/chart" />
          <div className="h-6 w-px bg-slate-200" aria-hidden="true" />
          <h1 className="text-sm font-semibold text-slate-900">{organizationName}</h1>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setInviteOpen(true)}
            >
              Invite teammates
            </Button>
          ) : null}
          {hasClaimedEmployee ? (
            <Link href="/profile">
              <Button variant="ghost" size="sm">
                My profile
              </Button>
            </Link>
          ) : null}
          <form action="/auth/signout" method="post">
            <Button type="submit" variant="ghost" size="sm">
              Sign out
            </Button>
          </form>
        </div>
      </header>

      {isAdmin ? (
        <InviteDialog open={inviteOpen} onClose={() => setInviteOpen(false)} />
      ) : null}
    </>
  )
}
