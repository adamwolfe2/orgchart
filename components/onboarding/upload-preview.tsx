'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { OrgChartTree } from '@/components/org-chart/tree'
import { Button } from '@/components/ui/button'
import type { CsvIssue, HeaderMapping } from '@/lib/csv'
import type { EmployeeNode } from '@/lib/types'

interface UploadPreviewProps {
  stagingId: string
  rowCount: number
  warnings: CsvIssue[]
  headerMappings: HeaderMapping[]
  unmappedHeaders: string[]
  sourceFilename: string | null
  roots: EmployeeNode[]
}

type Status = 'idle' | 'committing' | 'cancelling' | 'error'

export function UploadPreview({
  stagingId,
  rowCount,
  warnings,
  headerMappings,
  unmappedHeaders,
  sourceFilename,
  roots,
}: UploadPreviewProps) {
  const router = useRouter()
  const [status, setStatus] = useState<Status>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [warningsOpen, setWarningsOpen] = useState(false)

  const mappedFields = headerMappings.filter((m) => m.canonical)

  async function commit() {
    setStatus('committing')
    setErrorMessage(null)
    try {
      const response = await fetch('/api/employees/upload/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staging_id: stagingId }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.success) {
        setStatus('error')
        setErrorMessage(payload?.error ?? 'Commit failed. Please try again.')
        return
      }
      router.refresh()
      router.push('/chart')
    } catch {
      setStatus('error')
      setErrorMessage('Commit failed. Please check your connection.')
    }
  }

  async function cancel() {
    setStatus('cancelling')
    setErrorMessage(null)
    try {
      await fetch('/api/employees/upload/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staging_id: stagingId }),
      })
    } catch {
      // Non-fatal — even if the cancel request fails, the staging row
      // will expire in 30 minutes anyway. Just send the user back.
    }
    router.push('/onboarding/upload')
  }

  const busy = status === 'committing' || status === 'cancelling'

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Preview
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
          {rowCount} employees ready to upload
        </h1>
        {sourceFilename ? (
          <p className="mt-2 text-sm text-slate-500">
            From <span className="font-medium text-slate-700">{sourceFilename}</span>
          </p>
        ) : null}
        <p className="mt-3 text-sm text-slate-600">
          Review the tree below. If it looks right, commit the upload. If
          anything looks wrong, cancel and re-upload with a fixed file.
        </p>
      </div>

      {/* Mapping summary + warnings side-by-side on wide screens */}
      <div className="grid gap-4 md:grid-cols-2">
        {mappedFields.length > 0 ? (
          <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-medium text-slate-700">
              Column mapping ({mappedFields.length} detected)
            </p>
            <ul className="mt-3 space-y-1.5 text-xs text-slate-600">
              {mappedFields.map((m, i) => (
                <li key={i} className="flex items-center justify-between gap-2">
                  <span className="truncate font-mono text-slate-900">{m.raw}</span>
                  <span className="text-slate-400">{'→'}</span>
                  <span className="font-mono text-slate-700">{m.canonical}</span>
                </li>
              ))}
            </ul>
            {unmappedHeaders.length > 0 ? (
              <p className="mt-3 border-t border-slate-200 pt-3 text-xs text-slate-500">
                Ignored columns: {unmappedHeaders.join(', ')}
              </p>
            ) : null}
          </div>
        ) : null}

        {warnings.length > 0 ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-4">
            <button
              type="button"
              onClick={() => setWarningsOpen((o) => !o)}
              className="flex w-full items-center justify-between text-left"
            >
              <span className="text-xs font-medium text-amber-900">
                {warnings.length} note{warnings.length === 1 ? '' : 's'} during parsing
              </span>
              <span className="text-xs text-amber-700">
                {warningsOpen ? 'Hide' : 'Show'}
              </span>
            </button>
            {warningsOpen ? (
              <ul className="mt-3 max-h-56 space-y-1 overflow-y-auto text-xs text-amber-800">
                {warnings.map((w, i) => (
                  <li key={i}>
                    {typeof w.row === 'number' && w.row > 0 ? `Row ${w.row}: ` : ''}
                    {w.message}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-amber-800">
                Click to expand. These rows were either skipped or have
                supervisors we couldn&apos;t match — they&apos;ll still upload
                as top-level employees.
              </p>
            )}
          </div>
        ) : (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-xs font-medium text-emerald-900">
              Clean parse — no warnings
            </p>
            <p className="mt-2 text-xs text-emerald-800">
              Every row was parsed cleanly and every supervisor was matched
              to an employee in the file.
            </p>
          </div>
        )}
      </div>

      {/* Live tree preview */}
      <div className="rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-6 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Org chart preview
          </p>
          <p className="mt-1 text-sm text-slate-600">
            This is exactly what the chart will look like after commit.
          </p>
        </div>
        <div className="max-h-[60vh] overflow-auto">
          {roots.length > 0 ? (
            <OrgChartTree roots={roots} />
          ) : (
            <p className="px-6 py-8 text-sm text-slate-500">
              No employees to render.
            </p>
          )}
        </div>
      </div>

      {errorMessage ? (
        <p role="alert" className="text-sm text-red-600">
          {errorMessage}
        </p>
      ) : null}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={cancel}
          disabled={busy}
        >
          {status === 'cancelling' ? 'Cancelling...' : 'Cancel / re-upload'}
        </Button>
        <Button
          type="button"
          size="lg"
          onClick={commit}
          disabled={busy || rowCount === 0}
        >
          {status === 'committing'
            ? 'Committing...'
            : `Commit upload (${rowCount})`}
        </Button>
      </div>
    </div>
  )
}
