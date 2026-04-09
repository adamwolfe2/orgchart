import { Logo } from '@/components/brand/logo'

/**
 * Route-level loading UI for the upload preview page. The page
 * server-fetches the staging row from Supabase, and buildEmployeeTree
 * can take a beat for 100+ row files. Show a skeleton so there's no
 * flash of white while it runs.
 */
export default function UploadPreviewLoading() {
  return (
    <main className="min-h-screen bg-white">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <Logo size="md" />
      </header>

      <div className="mx-auto w-full max-w-6xl px-6 pb-20">
        <div className="space-y-8">
          <div>
            <div className="h-4 w-20 animate-pulse rounded bg-slate-100" />
            <div className="mt-3 h-10 w-80 animate-pulse rounded bg-slate-100" />
            <div className="mt-3 h-4 w-96 animate-pulse rounded bg-slate-100" />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="h-40 animate-pulse rounded-md bg-slate-100" />
            <div className="h-40 animate-pulse rounded-md bg-slate-100" />
          </div>

          <div className="rounded-lg border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-6 py-3">
              <div className="h-3 w-32 animate-pulse rounded bg-slate-100" />
              <div className="mt-2 h-4 w-64 animate-pulse rounded bg-slate-100" />
            </div>
            <div className="flex justify-center gap-4 p-12">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-24 w-40 animate-pulse rounded-xl bg-slate-100"
                />
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <div className="h-11 w-36 animate-pulse rounded-lg bg-slate-100" />
            <div className="h-11 w-44 animate-pulse rounded-lg bg-slate-100" />
          </div>
        </div>
      </div>
    </main>
  )
}
