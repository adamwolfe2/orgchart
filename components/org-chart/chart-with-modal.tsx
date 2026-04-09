'use client'

import { useState } from 'react'

import { ChatWidget } from '@/components/chat/chat-widget'
import type { ChatMessage, Employee, EmployeeNode } from '@/lib/types'
import { EmployeeModal } from './employee-modal'
import { OrgChartTree } from './tree'

interface ChartWithModalProps {
  roots: EmployeeNode[]
  /** All employees keyed by id for modal lookup from chat citations. */
  employeesById: Record<string, Employee>
  initialMessages: ChatMessage[]
  organizationName: string
}

/**
 * Client wrapper that lifts modal state so both the org chart tree and the
 * chat widget can open the same EmployeeModal.
 */
export function ChartWithModal({
  roots,
  employeesById,
  initialMessages,
  organizationName,
}: ChartWithModalProps) {
  const [selected, setSelected] = useState<Employee | null>(null)

  function handleEmployeeClick(employeeId: string) {
    const emp = employeesById[employeeId] ?? null
    setSelected(emp)
  }

  return (
    <>
      <OrgChartTree roots={roots} onSelectEmployee={setSelected} />
      <ChatWidget
        initialMessages={initialMessages}
        organizationName={organizationName}
        onEmployeeClick={handleEmployeeClick}
      />
      <EmployeeModal employee={selected} onClose={() => setSelected(null)} />
    </>
  )
}
