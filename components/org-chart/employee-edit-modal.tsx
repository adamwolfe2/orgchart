'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog } from '@/components/ui/dialog'
import type { Employee } from '@/lib/types'
import { getAvatarColor } from './employee-flow-node'

interface EmployeeEditModalProps {
  employee: Employee
  onClose: () => void
  /** Called with the updated employee after a successful save */
  onSave: (updated: Employee) => void
}

type FormState = {
  first_name: string
  last_name: string
  position: string
  supervisor_email: string
  context: string
  linkedin_url: string
  phone: string
}

function toFormState(emp: Employee): FormState {
  return {
    first_name: emp.first_name ?? '',
    last_name: emp.last_name ?? '',
    position: emp.position ?? '',
    supervisor_email: emp.supervisor_email ?? '',
    context: emp.context ?? '',
    linkedin_url: emp.linkedin_url ?? '',
    phone: emp.phone ?? '',
  }
}

export function EmployeeEditModal({ employee, onClose, onSave }: EmployeeEditModalProps) {
  const router = useRouter()
  const [form, setForm] = useState<FormState>(toFormState(employee))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fullName = `${employee.first_name} ${employee.last_name}`.trim()
  const avatarColor = getAvatarColor(fullName)
  const initials =
    `${employee.first_name?.[0] ?? ''}${employee.last_name?.[0] ?? ''}`.toUpperCase()

  function setField(key: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/employees/${employee.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: form.first_name.trim() || undefined,
          last_name: form.last_name.trim() || undefined,
          position: form.position.trim() || null,
          supervisor_email: form.supervisor_email.trim() || null,
          context: form.context.trim() || null,
          linkedin_url: form.linkedin_url.trim() || null,
          phone: form.phone.trim() || null,
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        setError(json.error ?? 'Failed to save')
        return
      }
      onSave(json.data.employee as Employee)
      router.refresh()
    } catch {
      setError('Network error — please try again')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onClose={onClose}>
      {/* Header */}
      <div className="mb-5 flex items-start gap-3">
        <div
          className="flex shrink-0 items-center justify-center rounded-full text-white font-bold shadow-sm"
          style={{ width: 48, height: 48, backgroundColor: avatarColor, fontSize: 16 }}
        >
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-bold text-slate-900 leading-tight">Edit employee</h2>
          <p className="text-sm text-slate-500 truncate">{employee.email}</p>
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="shrink-0 rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5" aria-hidden>
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Form */}
      <div className="space-y-4">
        {/* Name row */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="First name" required>
            <input
              type="text"
              value={form.first_name}
              onChange={(e) => setField('first_name', e.target.value)}
              className={inputCls}
              placeholder="Jane"
            />
          </Field>
          <Field label="Last name" required>
            <input
              type="text"
              value={form.last_name}
              onChange={(e) => setField('last_name', e.target.value)}
              className={inputCls}
              placeholder="Smith"
            />
          </Field>
        </div>

        <Field label="Position / title">
          <input
            type="text"
            value={form.position}
            onChange={(e) => setField('position', e.target.value)}
            className={inputCls}
            placeholder="e.g. VP of Sales"
          />
        </Field>

        <Field label="Supervisor email" hint="Leave blank if this person is a root">
          <input
            type="email"
            value={form.supervisor_email}
            onChange={(e) => setField('supervisor_email', e.target.value)}
            className={inputCls}
            placeholder="manager@company.com"
          />
        </Field>

        <Field label="Context" hint="What does this person own or manage?">
          <textarea
            value={form.context}
            onChange={(e) => setField('context', e.target.value)}
            className={`${inputCls} resize-none`}
            rows={4}
            placeholder="Leads the inside sales team. Owns pipeline metrics and rep coaching."
          />
        </Field>

        <Field label="LinkedIn URL">
          <input
            type="url"
            value={form.linkedin_url}
            onChange={(e) => setField('linkedin_url', e.target.value)}
            className={inputCls}
            placeholder="https://linkedin.com/in/..."
          />
        </Field>

        <Field label="Phone">
          <input
            type="tel"
            value={form.phone}
            onChange={(e) => setField('phone', e.target.value)}
            className={inputCls}
            placeholder="+1 (555) 000-0000"
          />
        </Field>

        {error ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
        ) : null}
      </div>

      {/* Footer */}
      <div className="mt-6 flex justify-end gap-3">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const inputCls =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200'

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string
  required?: boolean
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="mb-1.5 flex items-center gap-1 text-xs font-semibold text-slate-500 uppercase tracking-wide">
        {label}
        {required && <span className="text-red-400">*</span>}
      </label>
      {children}
      {hint ? <p className="mt-1 text-xs text-slate-400">{hint}</p> : null}
    </div>
  )
}
