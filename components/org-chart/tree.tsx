'use client'

import { useState } from 'react'
import type { Employee, EmployeeNode } from '@/lib/types'
import { EmployeeCard } from './employee-card'
import { EmployeeModal } from './employee-modal'

interface OrgChartTreeProps {
  roots: EmployeeNode[]
}

interface NodeProps {
  node: EmployeeNode
  onSelect: (employee: Employee) => void
}

/**
 * Recursive node renderer.
 *
 * Layout strategy (no SVG): each node is a column. If it has reports, we
 * render a vertical stem down from the card, then a row of children. Each
 * child sits in a column whose top is decorated with:
 *   - a horizontal connector (border-t) that stops at the column's left or
 *     right edge for the first/last child so the line never overshoots
 *   - a vertical stem dropping into the child card
 */
function TreeNode({ node, onSelect }: NodeProps) {
  const hasReports = node.reports.length > 0
  const reportCount = node.reports.length
  const isOnlyChild = reportCount === 1

  return (
    <div className="flex flex-col items-center">
      <EmployeeCard employee={node} onClick={() => onSelect(node)} />

      {hasReports ? (
        <>
          <div aria-hidden="true" className="h-8 w-px bg-slate-300" />
          <div className="flex items-start">
            {node.reports.map((report, index) => {
              const isFirst = index === 0
              const isLast = index === reportCount - 1
              const showLeft = !isFirst && !isOnlyChild
              const showRight = !isLast && !isOnlyChild

              return (
                <div
                  key={report.id}
                  className="relative flex flex-col items-center px-5"
                >
                  {!isOnlyChild ? (
                    <>
                      {showLeft ? (
                        <div
                          aria-hidden="true"
                          className="absolute left-0 top-0 h-px w-1/2 bg-slate-300"
                        />
                      ) : null}
                      {showRight ? (
                        <div
                          aria-hidden="true"
                          className="absolute right-0 top-0 h-px w-1/2 bg-slate-300"
                        />
                      ) : null}
                      {isFirst ? (
                        <div
                          aria-hidden="true"
                          className="absolute right-0 top-0 h-px w-1/2 bg-slate-300"
                        />
                      ) : null}
                      {isLast ? (
                        <div
                          aria-hidden="true"
                          className="absolute left-0 top-0 h-px w-1/2 bg-slate-300"
                        />
                      ) : null}
                      <div
                        aria-hidden="true"
                        className="h-8 w-px bg-slate-300"
                      />
                    </>
                  ) : null}
                  <TreeNode node={report} onSelect={onSelect} />
                </div>
              )
            })}
          </div>
        </>
      ) : null}
    </div>
  )
}

export function OrgChartTree({ roots }: OrgChartTreeProps) {
  const [selected, setSelected] = useState<Employee | null>(null)

  return (
    <>
      <div className="w-full overflow-x-auto">
        <div className="flex min-w-full justify-center gap-16 px-8 py-12">
          {roots.map((root) => (
            <TreeNode key={root.id} node={root} onSelect={setSelected} />
          ))}
        </div>
      </div>
      <EmployeeModal employee={selected} onClose={() => setSelected(null)} />
    </>
  )
}
