'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createClient } from '@/lib/supabase/client'
import type { OrganizationInvite } from '@/lib/types'

interface Organization {
  id: string
  name: string
  logo_url: string | null
  primary_color: string
}

interface AcceptInviteClientProps {
  invite: OrganizationInvite
  organization: Organization
  isAuthenticated: boolean
  token: string
}

/**
 * Client component for the /invite/[token] page.
 *
 * Authenticated users: shows a "Join {org}" button → POST /api/org/invites/accept → /chart
 * Unauthenticated users: shows magic-link signup form that redirects back to /invite/[token]
 */
export function AcceptInviteClient({
  invite,
  organization,
  isAuthenticated,
  token,
}: AcceptInviteClientProps) {
  const router = useRouter()
  const [joining, setJoining] = useState(false)
  const [joinError, setJoinError] = useState<string | null>(null)

  // Magic-link state for unauthenticated users
  const [email, setEmail] = useState('')
  const [magicStatus, setMagicStatus] = useState<'idle' | 'submitting' | 'sent'>('idle')
  const [magicError, setMagicError] = useState<string | null>(null)

  async function handleJoin() {
    setJoining(true)
    setJoinError(null)

    try {
      const response = await fetch('/api/org/invites/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })

      const json = await response.json()

      if (!json.success) {
        setJoinError(json.error ?? 'Failed to join organization. Please try again.')
        setJoining(false)
        return
      }

      router.push('/chart')
    } catch {
      setJoinError('Something went wrong. Please try again.')
      setJoining(false)
    }
  }

  async function handleMagicLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const trimmed = email.trim()
    if (!trimmed) {
      setMagicError('Please enter your email.')
      return
    }

    setMagicStatus('submitting')
    setMagicError(null)

    try {
      const supabase = createClient()
      const redirectTo =
        typeof window !== 'undefined'
          ? `${window.location.origin}/auth/callback?next=${encodeURIComponent(`/invite/${token}`)}`
          : undefined

      const { error } = await supabase.auth.signInWithOtp({
        email: trimmed,
        options: { emailRedirectTo: redirectTo },
      })

      if (error) {
        setMagicStatus('idle')
        setMagicError(error.message)
        return
      }

      setMagicStatus('sent')
    } catch {
      setMagicStatus('idle')
      setMagicError('Something went wrong. Please try again.')
    }
  }

  const orgName = organization.name

  return (
    <div className="w-full max-w-md">
      {organization.logo_url ? (
        <img
          src={organization.logo_url}
          alt={`${orgName} logo`}
          className="mb-6 h-12 w-auto object-contain"
        />
      ) : null}

      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
        You are invited to join {orgName}
      </h1>

      {isAuthenticated ? (
        <div className="mt-8">
          {joinError ? (
            <p role="alert" className="mb-4 text-sm text-red-600">
              {joinError}
            </p>
          ) : null}
          <Button
            onClick={handleJoin}
            disabled={joining}
            className="w-full"
            size="lg"
          >
            {joining ? 'Joining...' : `Join ${orgName}`}
          </Button>
        </div>
      ) : (
        <div className="mt-6">
          <p className="text-sm text-slate-600">
            Sign in to join {orgName}. We will email you a magic link.
          </p>

          {magicStatus === 'sent' ? (
            <div className="mt-6">
              <p className="text-sm leading-relaxed text-slate-600">
                We sent a magic link to{' '}
                <span className="font-medium text-slate-900">{email}</span>. Click
                the link to finish signing in and join {orgName}.
              </p>
              <Button
                variant="link"
                size="sm"
                className="mt-6 px-0"
                onClick={() => {
                  setMagicStatus('idle')
                  setEmail('')
                }}
              >
                Use a different email
              </Button>
            </div>
          ) : (
            <form onSubmit={handleMagicLink} className="mt-6 space-y-4" noValidate>
              <div className="space-y-2">
                <Label htmlFor="email">Work email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@company.com"
                  disabled={magicStatus === 'submitting'}
                />
              </div>

              {magicError ? (
                <p role="alert" className="text-sm text-red-600">
                  {magicError}
                </p>
              ) : null}

              <Button
                type="submit"
                disabled={magicStatus === 'submitting'}
                className="w-full"
                size="lg"
              >
                {magicStatus === 'submitting' ? 'Sending link...' : 'Send magic link'}
              </Button>
            </form>
          )}
        </div>
      )}
    </div>
  )
}
