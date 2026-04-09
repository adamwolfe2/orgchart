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
}

export function ChartWithModal({
  roots,
  employeesById,
  initialMessages,
  organizationName,
}: ChartWithModalProps) {
  const [selected, setSelected] = useState<Employee | null>(null)
  const flowRef = useRef<FlowChartHandle>(null)

  function handleEmployeeClick(employeeId: string) {
    const emp = employeesById[employeeId] ?? null
    if (emp) {
      setSelected(emp)
      flowRef.current?.focusEmployee(employeeId)
    }
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
      />
    </>
  )
}
