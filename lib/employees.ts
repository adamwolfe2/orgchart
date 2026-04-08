import { createClient } from './supabase/server'
import type { Employee, EmployeeNode, Organization } from './types'

export interface EmployeesTreeData {
  organization: Organization
  roots: EmployeeNode[]
}

/**
 * Build an org-chart tree from a flat employee list.
 *
 * Pure / immutable: never mutates input rows. Each EmployeeNode is a fresh
 * object with a `reports` array. Roots are employees whose supervisor_email
 * is empty OR whose supervisor_email does not match any employee in the set
 * (orphaned references float to the top so they remain visible).
 */
export function buildEmployeeTree(employees: Employee[]): EmployeeNode[] {
  const nodesByEmail = new Map<string, EmployeeNode>()
  employees.forEach((emp) => {
    nodesByEmail.set(emp.email.toLowerCase(), { ...emp, reports: [] })
  })

  const roots: EmployeeNode[] = []
  const childrenByParentEmail = new Map<string, EmployeeNode[]>()

  nodesByEmail.forEach((node) => {
    const supervisorKey = node.supervisor_email?.toLowerCase() ?? ''
    if (supervisorKey && nodesByEmail.has(supervisorKey)) {
      const existing = childrenByParentEmail.get(supervisorKey) ?? []
      childrenByParentEmail.set(supervisorKey, [...existing, node])
    } else {
      roots.push(node)
    }
  })

  const sortNodes = (a: EmployeeNode, b: EmployeeNode): number => {
    const lastCmp = a.last_name.localeCompare(b.last_name)
    if (lastCmp !== 0) return lastCmp
    return a.first_name.localeCompare(b.first_name)
  }

  const attachReports = (node: EmployeeNode): EmployeeNode => {
    const directReports = childrenByParentEmail.get(node.email.toLowerCase()) ?? []
    const resolved = directReports.map(attachReports).sort(sortNodes)
    return { ...node, reports: resolved }
  }

  return roots.map(attachReports).sort(sortNodes)
}

/**
 * Fetch the organization and its employees as a tree.
 * RLS-bound: assumes the caller has verified membership for `organizationId`.
 */
export async function getEmployeesForOrg(
  organizationId: string,
): Promise<EmployeesTreeData> {
  const supabase = await createClient()

  const { data: employees, error: empError } = await supabase
    .from('employees')
    .select('*')
    .eq('organization_id', organizationId)
    .order('last_name', { ascending: true })
    .order('first_name', { ascending: true })

  if (empError) {
    throw new Error(`Failed to load employees: ${empError.message}`)
  }

  const { data: organization, error: orgError } = await supabase
    .from('organizations')
    .select('*')
    .eq('id', organizationId)
    .single()

  if (orgError || !organization) {
    throw new Error(
      `Failed to load organization: ${orgError?.message ?? 'not found'}`,
    )
  }

  const roots = buildEmployeeTree((employees ?? []) as Employee[])

  return {
    organization: organization as Organization,
    roots,
  }
}
