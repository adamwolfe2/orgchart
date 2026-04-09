'use client'

import Image from 'next/image'
import { Dialog } from '@/components/ui/dialog'
import type { Employee } from '@/lib/types'
import { getAvatarColor } from './employee-flow-node'

interface EmployeeModalProps {
  employee: Employee | null
  /** All employees keyed by id — needed to resolve the supervisor row */
  employeesById?: Record<string, Employee>
  onClose: () => void
}

export function EmployeeModal({ employee, employeesById, onClose }: EmployeeModalProps) {
  if (!employee) return null

  const fullName = `${employee.first_name} ${employee.last_name}`.trim()
  const initials = `${employee.first_name?.[0] ?? ''}${employee.last_name?.[0] ?? ''}`.toUpperCase()
  const avatarColor = getAvatarColor(fullName)

  // Find supervisor
  let supervisor: Employee | undefined
  if (employee.supervisor_email && employeesById) {
    supervisor = Object.values(employeesById).find(
      (e) => e.email.toLowerCase() === employee.supervisor_email?.toLowerCase(),
    )
  }

  const supervisorInitials = supervisor
    ? `${supervisor.first_name?.[0] ?? ''}${supervisor.last_name?.[0] ?? ''}`.toUpperCase()
    : null
  const supervisorColor = supervisor
    ? getAvatarColor(`${supervisor.first_name} ${supervisor.last_name}`)
    : null

  return (
    <Dialog open={Boolean(employee)} onClose={onClose}>
      {/* Close button */}
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute right-4 top-4 rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5" aria-hidden>
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>

      {/* Avatar */}
      <div className="mb-4 flex flex-col items-center gap-3">
        <div
          className="flex items-center justify-center rounded-full text-white font-bold shadow-md"
          style={{ width: 72, height: 72, backgroundColor: avatarColor, fontSize: 22 }}
        >
          {employee.headshot_url ? (
            <Image
              src={employee.headshot_url}
              alt={fullName}
              width={72}
              height={72}
              className="h-full w-full rounded-full object-cover"
              unoptimized
            />
          ) : (
            initials
          )}
        </div>

        <div className="text-center">
          <h2 className="text-xl font-bold text-slate-900">{fullName}</h2>
          {employee.position ? (
            <p className="mt-0.5 text-sm text-slate-500">{employee.position}</p>
          ) : null}
        </div>
      </div>

      <div className="space-y-3">
        {/* Reports to */}
        {supervisor ? (
          <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
            <p className="mb-2 text-xs font-semibold text-slate-400 uppercase tracking-wide">Reports to</p>
            <div className="flex items-center gap-3">
              <div
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white text-xs font-bold"
                style={{ backgroundColor: supervisorColor! }}
              >
                {supervisorInitials}
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  {supervisor.first_name} {supervisor.last_name}
                </p>
                {supervisor.position ? (
                  <p className="text-xs text-slate-500">{supervisor.position}</p>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        {/* Email */}
        <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
          <p className="mb-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wide">Email</p>
          {employee.email ? (
            <a
              href={`mailto:${employee.email}`}
              className="text-sm font-medium text-blue-600 break-all hover:underline"
            >
              {employee.email}
            </a>
          ) : (
            <p className="text-sm text-slate-400">No email found</p>
          )}
        </div>

        {/* LinkedIn */}
        {employee.linkedin_url ? (
          <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
            <p className="mb-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wide">LinkedIn</p>
            <a
              href={employee.linkedin_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-blue-600 break-all hover:underline"
            >
              {employee.linkedin_url}
            </a>
          </div>
        ) : null}

        {/* Phone */}
        {employee.phone ? (
          <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
            <p className="mb-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wide">Phone</p>
            <a
              href={`tel:${employee.phone}`}
              className="text-sm font-medium text-slate-700 hover:underline"
            >
              {employee.phone}
            </a>
          </div>
        ) : null}

        {/* Context */}
        {employee.context ? (
          <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
            <p className="mb-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wide">Context</p>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{employee.context}</p>
          </div>
        ) : null}

        {/* Custom links */}
        {employee.custom_links && employee.custom_links.length > 0 ? (
          <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
            <p className="mb-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wide">Links</p>
            <ul className="space-y-1">
              {employee.custom_links.map((link) => (
                <li key={link.url}>
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-blue-600 hover:underline"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </Dialog>
  )
}
