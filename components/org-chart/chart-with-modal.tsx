'use client'

import { useRef, useState } from 'react'

import { BottomChatBar } from '@/components/chat/bottom-chat-bar'
import type { ChatMessage, Employee, EmployeeNode } from '@/lib/types'
import { EmployeeModal } from './employee-modal'
import { FlowChart, type FlowChartHandle } from './flow-chart'

interface ChartWithModalProps {
  roots: EmployeeNode[]
  employeesById: Record<string, Employee>
  initialMessages: ChatMessage[]
  organizationName: string
  isAdmin?: boolean
}

export function ChartWithModal({
  roots,
  employeesById: initialById,
  initialMessages,
  organizationName,
  isAdmin,
}: ChartWithModalProps) {
  const [selected, setSelected] = useState<Employee | null>(null)
  // Local copy so edits reflect immediately without a full page reload
  const [employeesById, setEmployeesById] = useState<Record<string, Employee>>(initialById)
  const flowRef = useRef<FlowChartHandle>(null)

  function handleEmployeeClick(employeeId: string) {
    const emp = employeesById[employeeId] ?? null
    if (emp) {
      setSelected(emp)
      flowRef.current?.focusEmployee(employeeId)
    }
  }

  function handleEmployeeUpdate(updated: Employee) {
    setEmployeesById((prev) => ({ ...prev, [updated.id]: updated }))
    setSelected((prev) => (prev?.id === updated.id ? updated : prev))
  }

  return (
    <>
      {/* Full-screen canvas */}
      <div className="fixed inset-0 top-14" style={{ zIndex: 0 }}>
        <FlowChart
          ref={flowRef}
          roots={roots}
          onSelectEmployee={setSelected}
        />
      </div>

      {/* Bottom chat bar — sits above the canvas */}
      <BottomChatBar
        initialMessages={initialMessages}
        organizationName={organizationName}
        onEmployeeClick={handleEmployeeClick}
      />

      {/* Employee detail modal */}
      <EmployeeModal
        employee={selected}
        employeesById={employeesById}
        onClose={() => setSelected(null)}
        isAdmin={isAdmin}
        onEmployeeUpdate={handleEmployeeUpdate}
      />
    </>
  )
}
