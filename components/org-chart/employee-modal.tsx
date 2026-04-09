'use client'

import Image from 'next/image'
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

function getInitials(firstName: string, lastName: string): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase()
}

export function EmployeeModal({ employee, onClose }: EmployeeModalProps) {
  if (!employee) return null

  const fullName = `${employee.first_name} ${employee.last_name}`.trim()

  return (
    <Dialog open={Boolean(employee)} onClose={onClose}>
      <DialogHeader>
        {/* Headshot */}
        <div className="mb-4 flex justify-center">
          {employee.headshot_url ? (
            <Image
              src={employee.headshot_url}
              alt={fullName}
              width={96}
              height={96}
              className="h-24 w-24 rounded-full object-cover ring-2 ring-slate-200"
              unoptimized
            />
          ) : (
            <div
              aria-hidden="true"
              className="flex h-24 w-24 items-center justify-center rounded-full bg-slate-200 text-xl font-semibold text-slate-600"
            >
              {getInitials(employee.first_name, employee.last_name)}
            </div>
          )}
        </div>

        <DialogTitle className="text-center">{fullName}</DialogTitle>
        {employee.position ? (
          <DialogDescription className="text-center">{employee.position}</DialogDescription>
        ) : null}
      </DialogHeader>

      <div className="mt-5 space-y-4">
        {/* Email */}
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

        {/* LinkedIn */}
        {employee.linkedin_url ? (
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
              LinkedIn
            </p>
            <a
              href={employee.linkedin_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 block break-all text-sm text-slate-700 underline-offset-4 hover:text-slate-900 hover:underline"
            >
              {employee.linkedin_url}
            </a>
          </div>
        ) : null}

        {/* Phone */}
        {employee.phone ? (
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Phone
            </p>
            <a
              href={`tel:${employee.phone}`}
              className="mt-1 block text-sm text-slate-700 underline-offset-4 hover:text-slate-900 hover:underline"
            >
              {employee.phone}
            </a>
          </div>
        ) : null}

        {/* Custom links */}
        {employee.custom_links && employee.custom_links.length > 0 ? (
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Links
            </p>
            <ul className="mt-1 space-y-1">
              {employee.custom_links.map((link) => (
                <li key={link.url}>
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-slate-700 underline-offset-4 hover:text-slate-900 hover:underline"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* Context */}
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
