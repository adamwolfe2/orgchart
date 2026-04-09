import { Logo } from '@/components/brand/logo'

/**
 * Route-level loading UI for /chart. The chart page is a server
 * component that blocks on Supabase queries; showing the header +
 * a skeleton avoids a flash of blank white while the tree loads.
 */
export default function ChartLoading() {
  return (
    <main className="min-h-screen bg-white">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <Logo size="md" />
      </header>

      <div className="mx-auto w-full max-w-6xl px-6 py-12">
        <div className="h-4 w-40 animate-pulse rounded bg-slate-100" />
        <div className="mt-3 h-8 w-72 animate-pulse rounded bg-slate-100" />

        <div className="mt-12 flex justify-center gap-6">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-24 w-48 animate-pulse rounded-xl bg-slate-100"
            />
          ))}
        </div>
        <div className="mx-auto mt-10 grid max-w-3xl grid-cols-4 gap-4">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-lg bg-slate-100"
            />
          ))}
        </div>
      </div>
    </main>
  )
}
