import { NextResponse } from 'next/server'
import { getCurrentUserAndMembership } from '@/lib/auth'
import { getEmployeesForOrg, type EmployeesTreeData } from '@/lib/employees'
import type { ApiResponse } from '@/lib/types'

/**
 * GET /api/employees
 *
 * Returns the current user's organization plus its employees rendered as a
 * tree of EmployeeNode roots. RLS protects the underlying table, but we also
 * filter explicitly by organization_id for clarity.
 */
export async function GET() {
  try {
    const auth = await getCurrentUserAndMembership()
    if (!auth) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'unauthorized' },
        { status: 401 },
      )
    }

    const { membership } = auth
    if (!membership) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: 'no organization' },
        { status: 404 },
      )
    }

    const data = await getEmployeesForOrg(membership.organization_id)

    return NextResponse.json<ApiResponse<EmployeesTreeData>>({
      success: true,
      data,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'internal error'
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: message },
      { status: 500 },
    )
  }
}
