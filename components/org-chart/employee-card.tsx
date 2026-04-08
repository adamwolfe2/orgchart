'use client'

import { cn } from '@/lib/utils'
import type { Employee } from '@/lib/types'

interface EmployeeCardProps {
  employee: Employee
  onClick?: () => void
}

function getInitials(employee: Employee): string {
  const first = employee.first_name?.[0] ?? ''
  const last = employee.last_name?.[0] ?? ''
  return `${first}${last}`.toUpperCase() || '?'
}

export function EmployeeCard({ employee, onClick }: EmployeeCardProps) {
  const initials = getInitials(employee)
  const fullName = `${employee.first_name} ${employee.last_name}`.trim()

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group flex min-w-48 items-center gap-3 rounded-xl bg-white p-3 text-left',
        'border border-slate-100 shadow-card transition-all duration-150 ease-out',
        'hover:shadow-card-hover hover:border-slate-200',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/30 focus-visible:ring-offset-2 focus-visible:ring-offset-white',
      )}
    >
      <span
        aria-hidden="true"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-700"
      >
        {initials}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-semibold text-slate-900">
          {fullName}
        </span>
        {employee.position ? (
          <span className="truncate text-xs text-slate-500">
            {employee.position}
          </span>
        ) : null}
      </span>
    </button>
  )
}
