import { redirect } from 'next/navigation'

import { Logo } from '@/components/brand/logo'
import { FallingPattern } from '@/components/ui/falling-pattern'
import { UploadPreview } from '@/components/onboarding/upload-preview'
import type { CsvIssue, CsvRow, HeaderMapping } from '@/lib/csv'
import { buildEmployeeTree } from '@/lib/employees'
import { createClient } from '@/lib/supabase/server'
import type { Employee, EmployeeNode } from '@/lib/types'

interface PageProps {
  searchParams: Promise<{ staging?: string }>
}

/**
 * Preview page shown after /api/employees/upload stages a CSV.
 * Reads the staging row (RLS-bound to the caller's org), builds a
 * live tree from the parsed rows, and hands everything to the
 * UploadPreview client component.
 */
export default async function UploadPreviewPage({ searchParams }: PageProps) {
  const { staging } = await searchParams

  if (!staging) {
    redirect('/onboarding/upload')
  }

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/signup?next=/onboarding/upload')
  }

  const { data: stagingRow, error } = await supabase
    .from('employee_upload_stagings')
    .select(
      'id, organization_id, parsed_rows, warnings, header_mappings, unmapped_headers, source_filename, expires_at',
    )
    .eq('id', staging)
    .maybeSingle()

  if (error || !stagingRow) {
    redirect('/onboarding/upload')
  }

  const parsedRows = (stagingRow.parsed_rows ?? []) as CsvRow[]
  const warnings = (stagingRow.warnings ?? []) as CsvIssue[]
  const headerMappings = (stagingRow.header_mappings ?? []) as HeaderMapping[]
  const unmappedHeaders = (stagingRow.unmapped_headers ?? []) as string[]

  // Build synthetic Employee objects from the staged rows so we can run
  // the existing tree builder for a live preview. IDs are derived from
  // the email so React keys are stable.
  const now = new Date().toISOString()
  const syntheticEmployees: Employee[] = parsedRows.map((row, idx) => ({
    id: `preview-${idx}-${row.email}`,
    organization_id: stagingRow.organization_id,
    first_name: row.first_name,
    last_name: row.last_name,
    email: row.email,
    position: row.position || null,
    supervisor_email: row.supervisor_email || null,
    context: row.context || null,
    headshot_url: null,
    linkedin_url: null,
    phone: null,
    custom_links: [],
    slack_user_id: null,
    claimed_by_user_id: null,
    created_at: now,
    updated_at: now,
  }))

  const roots: EmployeeNode[] = buildEmployeeTree(syntheticEmployees)

  return (
    <main className="relative isolate min-h-screen bg-white">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      >
        <FallingPattern
          className="h-full w-full [mask-image:radial-gradient(ellipse_at_top,black_50%,transparent_100%)]"
          density={1.25}
          duration={300}
          blurIntensity="0.7em"
        />
      </div>
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <Logo size="md" />
      </header>

      <div className="mx-auto w-full max-w-6xl px-6 pb-20">
        <UploadPreview
          stagingId={stagingRow.id}
          rowCount={parsedRows.length}
          warnings={warnings}
          headerMappings={headerMappings}
          unmappedHeaders={unmappedHeaders}
          sourceFilename={stagingRow.source_filename ?? null}
          roots={roots}
        />
      </div>
    </main>
  )
}
