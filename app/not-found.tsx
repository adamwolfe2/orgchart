import Link from 'next/link'

import { Logo } from '@/components/brand/logo'
import { Button } from '@/components/ui/button'

/**
 * Custom 404 page. Shown for any unknown route. Keeps the logo and
 * tone consistent with the rest of the app instead of the default
 * Next.js black-on-white "404 This page could not be found."
 */
export default function NotFound() {
  return (
    <main className="min-h-screen bg-white">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <Logo size="md" />
      </header>

      <div className="mx-auto flex max-w-md flex-col items-start px-6 pt-20">
        <p className="font-mono text-xs uppercase tracking-wide text-slate-400">
          404
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
          That page doesn&apos;t exist
        </h1>
        <p className="mt-3 text-sm text-slate-600">
          The link you followed might be broken, or the page may have been
          moved. Head back home and try again.
        </p>

        <Link href="/" className="mt-8">
          <Button type="button" size="lg">
            Go home
          </Button>
        </Link>
      </div>
    </main>
  )
}
