'use client'

import Link from 'next/link'
import { useEffect } from 'react'

import { Logo } from '@/components/brand/logo'
import { Button } from '@/components/ui/button'

/**
 * Global error boundary. Catches anything a server or client component
 * throws that doesn't have a more specific error.tsx closer to the
 * error site. Keeps the header + logo visible so the user still
 * knows where they are, offers a retry and a "go home" escape hatch.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Minimal structured log so Vercel captures the digest for
    // cross-referencing with server logs.
    console.error('UI error boundary:', {
      message: error.message,
      digest: error.digest,
    })
  }, [error])

  return (
    <main className="min-h-screen bg-white">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <Logo size="md" />
      </header>

      <div className="mx-auto flex max-w-md flex-col items-start px-6 pt-20">
        <p className="text-xs font-medium uppercase tracking-wide text-red-600">
          Something went wrong
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
          We hit an unexpected error
        </h1>
        <p className="mt-3 text-sm text-slate-600">
          The page couldn&apos;t load. You can retry, or go back to the home
          page and try again.
        </p>
        {error.digest ? (
          <p className="mt-4 font-mono text-xs text-slate-400">
            ref: {error.digest}
          </p>
        ) : null}

        <div className="mt-8 flex gap-3">
          <Button type="button" size="lg" onClick={() => reset()}>
            Try again
          </Button>
          <Link href="/">
            <Button type="button" size="lg" variant="outline">
              Go home
            </Button>
          </Link>
        </div>
      </div>
    </main>
  )
}
