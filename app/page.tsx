import Link from 'next/link'

import { Logo } from '@/components/brand/logo'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

const CSV_SAMPLE = `first_name,last_name,email,position,supervisor_email
Jane,Smith,jane@acme.com,CEO,
John,Doe,john@acme.com,VP Engineering,jane@acme.com
Sarah,Lee,sarah@acme.com,Senior Engineer,john@acme.com`

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-white">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5">
        <Logo size="md" />
        <Link
          href="/signup"
          className="text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          Sign in
        </Link>
      </header>

      <section className="mx-auto w-full max-w-4xl px-6 pt-16 pb-20 text-center">
        <div className="flex justify-center">
          <Badge variant="outline">Free during beta</Badge>
        </div>

        <h1 className="mt-6 text-5xl font-semibold leading-[1.05] tracking-tight text-slate-900 md:text-6xl">
          {`Your team's org chart, from a `}
          <span className="border-b-4 border-slate-900">single CSV</span>.
        </h1>

        <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-600">
          Download the template, fill it in with your team, upload. We render a
          clean, hosted, searchable org chart in under five minutes.
        </p>

        <div className="mx-auto mt-12 grid max-w-3xl gap-4 md:grid-cols-2">
          <div className="flex flex-col items-center rounded-xl border border-slate-200 bg-white p-8 text-center">
            <span className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-sm font-medium text-slate-900">
              1
            </span>
            <h2 className="mt-4 text-base font-semibold text-slate-900">
              Download the template
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              A six-column CSV. Fuzzy column matching, so messy headers are
              fine.
            </p>
            <a href="/orgchart-template.csv" download className="mt-6 w-full">
              <Button size="lg" variant="outline" className="w-full">
                Download CSV
              </Button>
            </a>
          </div>

          <div className="flex flex-col items-center rounded-xl border border-slate-200 bg-white p-8 text-center">
            <span className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-sm font-medium text-slate-900">
              2
            </span>
            <h2 className="mt-4 text-base font-semibold text-slate-900">
              Sign up and upload
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Magic link sign-up. No password. Your chart is live the moment
              the upload finishes.
            </p>
            <Link href="/signup" className="mt-6 w-full">
              <Button size="lg" className="w-full">
                Get started
              </Button>
            </Link>
          </div>
        </div>

        <details className="mx-auto mt-10 max-w-2xl text-left">
          <summary className="cursor-pointer text-sm text-slate-500 hover:text-slate-900">
            Preview the CSV format
          </summary>
          <pre className="mt-3 overflow-x-auto rounded-md border border-slate-200 bg-slate-50 p-4 font-mono text-xs leading-relaxed text-slate-700">
            {CSV_SAMPLE}
          </pre>
        </details>
      </section>

      <footer className="mx-auto w-full max-w-6xl px-6 pb-10 text-center text-sm text-slate-500">
        Product of{' '}
        <a
          href="https://aimanagingservices.com"
          target="_blank"
          rel="noreferrer"
          className="font-medium text-slate-700 underline-offset-4 hover:text-slate-900 hover:underline"
        >
          AIMS
        </a>
      </footer>
    </main>
  )
}
