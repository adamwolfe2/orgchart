'use client'

import { useState } from 'react'
import type { Employee } from '@/lib/types'
import { getAvatarColor } from '@/components/org-chart/employee-flow-node'
import { EmployeeEditModal } from '@/components/org-chart/employee-edit-modal'

interface RosterTableProps {
  employees: Employee[]
}

export function RosterTable({ employees: initial }: RosterTableProps) {
  const [employees, setEmployees] = useState<Employee[]>(initial)
  const [editing, setEditing] = useState<Employee | null>(null)
  const [query, setQuery] = useState('')

  function handleSave(updated: Employee) {
    setEmployees((prev) => prev.map((e) => (e.id === updated.id ? updated : e)))
    setEditing(null)
  }

  const filtered = query
    ? employees.filter((e) => {
        const q = query.toLowerCase()
        return (
          e.first_name.toLowerCase().includes(q) ||
          e.last_name.toLowerCase().includes(q) ||
          (e.position ?? '').toLowerCase().includes(q) ||
          e.email.toLowerCase().includes(q)
        )
      })
    : employees

  return (
    <>
      {/* Search bar */}
      <div className="mb-4">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, title, or email…"
          className="w-full max-w-sm rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
        />
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50 text-left">
              <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Name</th>
              <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Position</th>
              <th className="hidden px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide md:table-cell">Email</th>
              <th className="hidden px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide lg:table-cell">Supervisor</th>
              <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Context</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((emp) => {
              const fullName = `${emp.first_name} ${emp.last_name}`.trim()
              const initials =
                `${emp.first_name?.[0] ?? ''}${emp.last_name?.[0] ?? ''}`.toUpperCase()
              const color = getAvatarColor(fullName)

              return (
                <tr
                  key={emp.id}
                  className="group transition-colors hover:bg-slate-50"
                >
                  {/* Name + avatar */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                        style={{ backgroundColor: color }}
                      >
                        {initials}
                      </div>
                      <span className="font-medium text-slate-900">{fullName}</span>
                    </div>
                  </td>

                  {/* Position */}
                  <td className="px-4 py-3 text-slate-600">
                    {emp.position ?? <span className="italic text-slate-400">—</span>}
                  </td>

                  {/* Email */}
                  <td className="hidden px-4 py-3 md:table-cell">
                    <a
                      href={`mailto:${emp.email}`}
                      className="text-blue-600 hover:underline"
                    >
                      {emp.email}
                    </a>
                  </td>

                  {/* Supervisor */}
                  <td className="hidden px-4 py-3 text-slate-500 lg:table-cell">
                    {emp.supervisor_email ?? <span className="italic text-slate-400">—</span>}
                  </td>

                  {/* Context */}
                  <td className="max-w-xs px-4 py-3 text-slate-500">
                    {emp.context ? (
                      <span className="line-clamp-2">{emp.context}</span>
                    ) : (
                      <span className="italic text-slate-400">No context yet</span>
                    )}
                  </td>

                  {/* Edit action */}
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => setEditing(emp)}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-slate-50"
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              )
            })}
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-400">
                  No employees match your search.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {/* Count */}
      <p className="mt-3 text-xs text-slate-400">
        {filtered.length} of {employees.length} employees
      </p>

      {/* Edit modal */}
      {editing ? (
        <EmployeeEditModal
          employee={editing}
          onClose={() => setEditing(null)}
          onSave={handleSave}
        />
      ) : null}
    </>
  )
}
