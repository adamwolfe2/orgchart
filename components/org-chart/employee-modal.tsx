'use client'

import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { Employee } from '@/lib/types'

interface EmployeeModalProps {
  employee: Employee | null
  onClose: () => void
}

export function EmployeeModal({ employee, onClose }: EmployeeModalProps) {
  if (!employee) return null

  const fullName = `${employee.first_name} ${employee.last_name}`.trim()

  return (
    <Dialog open={Boolean(employee)} onClose={onClose}>
      <DialogHeader>
        <DialogTitle>{fullName}</DialogTitle>
        {employee.position ? (
          <DialogDescription>{employee.position}</DialogDescription>
        ) : null}
      </DialogHeader>

      <div className="mt-5 space-y-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Email
          </p>
          <a
            href={`mailto:${employee.email}`}
            className="mt-1 block break-all text-sm text-slate-700 underline-offset-4 hover:text-slate-900 hover:underline"
          >
            {employee.email}
          </a>
        </div>

        {employee.context ? (
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Context
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
              {employee.context}
            </p>
          </div>
        ) : null}
      </div>
    </Dialog>
  )
}
