'use client'

import { Suspense, useState, type FormEvent } from 'react'
import { useSearchParams } from 'next/navigation'

import { Logo } from '@/components/brand/logo'
import { Button } from '@/components/ui/button'
import { FallingPattern } from '@/components/ui/falling-pattern'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createClient } from '@/lib/supabase/client'

function SignupForm() {
  const searchParams = useSearchParams()
  const next = searchParams.get('next') ?? '/onboarding/org'
  const initialError =
    searchParams.get('error') === 'auth_failed'
      ? 'We could not sign you in. Please request a new magic link.'
      : null

  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'submitting' | 'sent'>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(initialError)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const trimmed = email.trim()
    if (!trimmed) {
      setErrorMessage('Please enter your email.')
      return
    }

    setStatus('submitting')
    setErrorMessage(null)

    try {
      const supabase = createClient()
      const redirectTo =
        typeof window !== 'undefined'
          ? `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`
          : undefined

      const { error } = await supabase.auth.signInWithOtp({
        email: trimmed,
        options: { emailRedirectTo: redirectTo },
      })

      if (error) {
        setStatus('idle')
        setErrorMessage(error.message)
        return
      }

      setStatus('sent')
    } catch {
      setStatus('idle')
      setErrorMessage('Something went wrong. Please try again.')
    }
  }

  if (status === 'sent') {
    return (
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Check your email
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">
          We sent a magic link to{' '}
          <span className="font-medium text-slate-900">{email}</span>. Click
          the link to finish signing in.
        </p>
        <Button
          variant="link"
          size="sm"
          className="mt-6 px-0"
          onClick={() => {
            setStatus('idle')
            setEmail('')
          }}
        >
          Use a different email
        </Button>
      </div>
    )
  }

  return (
    <div className="w-full max-w-md">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
        Sign in to OrgChart
      </h1>
      <p className="mt-3 text-sm text-slate-600">
        We&apos;ll email you a magic link.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-4" noValidate>
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
            disabled={status === 'submitting'}
          />
        </div>

        {errorMessage ? (
          <p role="alert" className="text-sm text-red-600">
            {errorMessage}
          </p>
        ) : null}

        <Button
          type="submit"
          disabled={status === 'submitting'}
          className="w-full"
          size="lg"
        >
          {status === 'submitting' ? 'Sending link...' : 'Send magic link'}
        </Button>
      </form>
    </div>
  )
}

export default function SignupPage() {
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
        <Suspense
          fallback={
            <div className="w-full max-w-md text-sm text-slate-500">
              Loading...
            </div>
          }
        >
          <SignupForm />
        </Suspense>
      </div>
    </main>
  )
}
