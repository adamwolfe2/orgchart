'use client'

import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import type { Employee } from '@/lib/types'

/** 24 vibrant, well-distributed hues — consistent per person via name hash */
const PALETTE = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308',
  '#84cc16', '#22c55e', '#10b981', '#14b8a6',
  '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1',
  '#8b5cf6', '#a855f7', '#d946ef', '#ec4899',
  '#f43f5e', '#fb923c', '#4ade80', '#34d399',
  '#38bdf8', '#818cf8', '#c084fc', '#fb7185',
]

export function getAvatarColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
    hash = hash | 0 // convert to 32-bit int
  }
  return PALETTE[Math.abs(hash) % PALETTE.length]
}

export interface EmployeeFlowNodeData extends Employee {
  isRoot?: boolean
}

interface Props {
  data: EmployeeFlowNodeData
  selected?: boolean
}

export const EmployeeFlowNode = memo(function EmployeeFlowNode({ data, selected }: Props) {
  const initials = `${data.first_name?.[0] ?? ''}${data.last_name?.[0] ?? ''}`.toUpperCase() || '?'
  const fullName = `${data.first_name} ${data.last_name}`.trim()
  const color = getAvatarColor(fullName)

  return (
    <div
      className="flex flex-col items-center gap-1 rounded-xl px-2 py-2 transition-all duration-150 cursor-pointer"
      style={{
        minWidth: 96,
        outline: selected ? `2px solid ${color}` : undefined,
        outlineOffset: selected ? 2 : undefined,
      }}
    >
      <Handle type="target" position={Position.Top} className="!opacity-0 !pointer-events-none" />

      {/* Avatar circle */}
      <div
        className="flex items-center justify-center rounded-full text-white font-bold shadow-md select-none"
        style={{
          width: 44,
          height: 44,
          backgroundColor: color,
          fontSize: 14,
        }}
      >
        {data.headshot_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={data.headshot_url}
            alt={fullName}
            className="h-full w-full rounded-full object-cover"
          />
        ) : (
          initials
        )}
      </div>

      {/* Name + title */}
      <div className="flex flex-col items-center gap-0.5 text-center" style={{ maxWidth: 120 }}>
        <span className="text-xs font-semibold text-slate-900 leading-tight line-clamp-2">
          {fullName}
        </span>
        {data.position ? (
          <span className="text-[10px] text-slate-500 leading-tight line-clamp-1">
            {data.position}
          </span>
        ) : null}
      </div>

      <Handle type="source" position={Position.Bottom} className="!opacity-0 !pointer-events-none" />
    </div>
  )
})
