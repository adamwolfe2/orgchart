'use client'

import React, { useCallback, useEffect, useImperativeHandle, useMemo, forwardRef } from 'react'
import {
  Background,
  BackgroundVariant,
  Controls,
  type Edge,
  type Node,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  MarkerType,
  type NodeTypes,
} from '@xyflow/react'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ReactFlow = (require('@xyflow/react') as { ReactFlow: unknown }).ReactFlow
import dagre from '@dagrejs/dagre'
import '@xyflow/react/dist/style.css'

import type { Employee, EmployeeNode } from '@/lib/types'
import { EmployeeFlowNode } from './employee-flow-node'

export interface FlowChartHandle {
  focusEmployee: (employeeId: string) => void
}

interface FlowChartProps {
  roots: EmployeeNode[]
  onSelectEmployee: (employee: Employee) => void
}

const NODE_WIDTH = 130
const NODE_HEIGHT = 90

const nodeTypes: NodeTypes = { employee: EmployeeFlowNode as NodeTypes['employee'] }

/** Flatten tree into nodes + edges, run dagre layout, return positioned elements. */
function buildLayout(roots: EmployeeNode[]): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'TB', ranksep: 80, nodesep: 24, marginx: 40, marginy: 40 })

  const allEmployees = new Map<string, EmployeeNode>()

  function visit(node: EmployeeNode) {
    allEmployees.set(node.id, node)
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT })
    for (const report of node.reports) {
      g.setEdge(node.id, report.id)
      visit(report)
    }
  }
  for (const root of roots) visit(root)

  dagre.layout(g)

  const flowNodes: Node[] = []
  const flowEdges: Edge[] = []

  // Group background rectangles
  const groupPadding = 20
  for (const [id, emp] of allEmployees) {
    if (emp.reports.length === 0) continue
    const reportPositions = emp.reports.map((r) => g.node(r.id))
    const minX = Math.min(...reportPositions.map((p) => p.x - NODE_WIDTH / 2)) - groupPadding
    const maxX = Math.max(...reportPositions.map((p) => p.x + NODE_WIDTH / 2)) + groupPadding
    const minY = Math.min(...reportPositions.map((p) => p.y - NODE_HEIGHT / 2)) - groupPadding
    const maxY = Math.max(...reportPositions.map((p) => p.y + NODE_HEIGHT / 2)) + groupPadding

    flowNodes.push({
      id: `group-${id}`,
      type: 'default',
      position: { x: minX, y: minY },
      style: {
        width: maxX - minX,
        height: maxY - minY,
        background: 'rgba(248,250,252,0.85)',
        border: '1.5px solid #e2e8f0',
        borderRadius: 14,
        pointerEvents: 'none',
        zIndex: -1,
      },
      data: { label: '' },
      selectable: false,
      draggable: false,
      focusable: false,
    })
  }

  // Employee nodes
  for (const [id, emp] of allEmployees) {
    const { x, y } = g.node(id)
    flowNodes.push({
      id,
      type: 'employee',
      position: { x: x - NODE_WIDTH / 2, y: y - NODE_HEIGHT / 2 },
      // Cast to satisfy React Flow's Record<string,unknown> data constraint
      data: emp as unknown as Record<string, unknown>,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    })

    for (const report of emp.reports) {
      flowEdges.push({
        id: `e-${id}-${report.id}`,
        source: id,
        target: report.id,
        type: 'smoothstep',
        style: { stroke: '#cbd5e1', strokeWidth: 1.5 },
        markerEnd: { type: MarkerType.Arrow, color: '#cbd5e1', width: 14, height: 14 },
      })
    }
  }

  return { nodes: flowNodes, edges: flowEdges }
}

/** Inner component — has access to useReactFlow() */
const FlowChartInner = forwardRef<FlowChartHandle, FlowChartProps>(function FlowChartInner(
  { roots, onSelectEmployee },
  ref,
) {
  const { fitView, setCenter, getNode } = useReactFlow()
  const { nodes: initialNodes, edges: initialEdges } = useMemo(() => buildLayout(roots), [roots])

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, , onEdgesChange] = useEdgesState(initialEdges)

  useEffect(() => {
    const timer = setTimeout(() => {
      void fitView({ padding: 0.15, duration: 400 })
    }, 50)
    return () => clearTimeout(timer)
  }, [fitView])

  useImperativeHandle(
    ref,
    () => ({
      focusEmployee(employeeId: string) {
        const node = getNode(employeeId)
        if (node) {
          setCenter(
            node.position.x + NODE_WIDTH / 2,
            node.position.y + NODE_HEIGHT / 2,
            { zoom: 1.4, duration: 600 },
          )
          setNodes((nds) =>
            nds.map((n) => ({ ...n, selected: n.id === employeeId })),
          )
        }
      },
    }),
    [getNode, setCenter, setNodes],
  )

  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      if (node.type !== 'employee') return
      onSelectEmployee(node.data as unknown as Employee)
    },
    [onSelectEmployee],
  )

  return (
    // @ts-expect-error — @xyflow/react not yet typed for React 19
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeClick={onNodeClick}
      fitView
      fitViewOptions={{ padding: 0.15 }}
      minZoom={0.1}
      maxZoom={3}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable
      panOnDrag
      zoomOnScroll
      zoomOnPinch
      className="h-full w-full"
      proOptions={{ hideAttribution: true }}
    >
      <Background
        variant={BackgroundVariant.Dots}
        gap={20}
        size={1}
        color="#e2e8f0"
      />
      <Controls showInteractive={false} className="rounded-lg border border-slate-100 shadow-sm" />
    </ReactFlow>
  )
})

/** Public component — wraps with ReactFlowProvider */
export const FlowChart = forwardRef<FlowChartHandle, FlowChartProps>(function FlowChart(props, ref) {
  return (
    <ReactFlowProvider>
      <FlowChartInner {...props} ref={ref} />
    </ReactFlowProvider>
  )
})
