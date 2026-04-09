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

// Grid layout constants
const GRID_THRESHOLD = 4   // ≥ this many leaf siblings → use grid
const MAX_COLS = 5
const H_GAP = 12           // horizontal gap between grid cells
const V_GAP = 16           // vertical gap between grid rows
const GRID_PAD = 16        // padding inside the group box
const GROUP_PAD = 20       // padding around dagre-positioned groups

const nodeTypes: NodeTypes = { employee: EmployeeFlowNode as NodeTypes['employee'] }

interface GridGroup {
  leafReports: EmployeeNode[]
  cols: number
  gridWidth: number
  gridHeight: number
}

/** Determine the best column count for N items — roughly square, max MAX_COLS. */
function bestCols(n: number): number {
  if (n <= 2) return n
  if (n <= 4) return 2
  if (n <= 6) return 3
  if (n <= 9) return 3
  if (n <= 12) return 4
  return Math.min(Math.ceil(Math.sqrt(n)), MAX_COLS)
}

function gridDimensions(n: number): { cols: number; gridWidth: number; gridHeight: number } {
  const cols = bestCols(n)
  const rows = Math.ceil(n / cols)
  return {
    cols,
    gridWidth: cols * NODE_WIDTH + (cols - 1) * H_GAP + 2 * GRID_PAD,
    gridHeight: rows * NODE_HEIGHT + (rows - 1) * V_GAP + 2 * GRID_PAD,
  }
}

/**
 * Two-tier layout:
 *  1. dagre handles the top-level hierarchy (managers + virtual grid nodes)
 *  2. Large leaf groups (≥ GRID_THRESHOLD siblings with no sub-reports) get
 *     a compact grid box rather than a sprawling horizontal row.
 */
function buildLayout(roots: EmployeeNode[]): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'TB', ranksep: 100, nodesep: 32, marginx: 60, marginy: 60 })

  // All non-leaf employees (will become React Flow nodes via dagre positions)
  const dagreEmployees = new Map<string, EmployeeNode>()
  // Employees that are pure leaves but too few for a grid — also go through dagre
  const dagreLeaves = new Map<string, EmployeeNode>()
  // Managers whose large leaf groups get grid treatment
  const gridGroups = new Map<string, GridGroup>()

  function visit(node: EmployeeNode) {
    dagreEmployees.set(node.id, node)
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT })

    const leafReports = node.reports.filter((r) => r.reports.length === 0)
    const branchReports = node.reports.filter((r) => r.reports.length > 0)

    // Large leaf teams → virtual grid node in dagre
    if (leafReports.length >= GRID_THRESHOLD) {
      const dims = gridDimensions(leafReports.length)
      const gid = `grid-${node.id}`
      g.setNode(gid, { width: dims.gridWidth, height: dims.gridHeight })
      g.setEdge(node.id, gid)
      gridGroups.set(node.id, { leafReports, ...dims })
    } else {
      // Small leaf group — lay out individually in dagre
      for (const leaf of leafReports) {
        dagreLeaves.set(leaf.id, leaf)
        g.setNode(leaf.id, { width: NODE_WIDTH, height: NODE_HEIGHT })
        g.setEdge(node.id, leaf.id)
      }
    }

    // Branch reports always recurse
    for (const branch of branchReports) {
      g.setEdge(node.id, branch.id)
      visit(branch)
    }
  }

  for (const root of roots) visit(root)

  dagre.layout(g)

  const flowNodes: Node[] = []
  const flowEdges: Edge[] = []

  /** Push a background group rectangle (rendered below everything). */
  function pushGroup(id: string, x: number, y: number, w: number, h: number) {
    flowNodes.unshift({
      id,
      type: 'default',
      position: { x, y },
      style: {
        width: w,
        height: h,
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

  /** Employee node at an absolute position. */
  function pushEmployee(emp: EmployeeNode, x: number, y: number) {
    flowNodes.push({
      id: emp.id,
      type: 'employee',
      position: { x, y },
      data: emp as unknown as Record<string, unknown>,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    })
  }

  // ── 1. Dagre-positioned employees (managers + small-group leaves) ────────
  for (const [id, emp] of dagreEmployees) {
    const { x, y } = g.node(id)
    pushEmployee(emp, x - NODE_WIDTH / 2, y - NODE_HEIGHT / 2)
  }
  for (const [id, emp] of dagreLeaves) {
    const { x, y } = g.node(id)
    pushEmployee(emp, x - NODE_WIDTH / 2, y - NODE_HEIGHT / 2)
  }

  // ── 2. Grid groups ───────────────────────────────────────────────────────
  for (const [managerId, info] of gridGroups) {
    const gv = g.node(`grid-${managerId}`)
    const boxX = gv.x - info.gridWidth / 2
    const boxY = gv.y - info.gridHeight / 2

    pushGroup(`group-grid-${managerId}`, boxX, boxY, info.gridWidth, info.gridHeight)

    // Individual employees at their grid positions
    info.leafReports.forEach((report, i) => {
      const col = i % info.cols
      const row = Math.floor(i / info.cols)
      pushEmployee(
        report,
        boxX + GRID_PAD + col * (NODE_WIDTH + H_GAP),
        boxY + GRID_PAD + row * (NODE_HEIGHT + V_GAP),
      )
    })

    // Invisible connector node at the top-center of the group box
    // (gives the edge from the manager somewhere to land)
    const connId = `conn-${managerId}`
    flowNodes.push({
      id: connId,
      type: 'default',
      position: { x: gv.x - 1, y: boxY - 1 },
      style: { width: 2, height: 2, opacity: 0, pointerEvents: 'none' },
      data: { label: '' },
      selectable: false,
      draggable: false,
      focusable: false,
    })

    flowEdges.push({
      id: `e-${managerId}-grid`,
      source: managerId,
      target: connId,
      type: 'smoothstep',
      style: { stroke: '#cbd5e1', strokeWidth: 1.5 },
      markerEnd: { type: MarkerType.Arrow, color: '#cbd5e1', width: 14, height: 14 },
    })
  }

  // ── 3. Group boxes for dagre-positioned children ─────────────────────────
  for (const [id, emp] of dagreEmployees) {
    // Find children that went through dagre (small leaves + branch children)
    const branchChildren = emp.reports.filter((r) => r.reports.length > 0)
    const smallLeafChildren = gridGroups.has(id)
      ? []  // all leaves were gridded; branches handled separately
      : emp.reports.filter((r) => r.reports.length === 0)
    const dagreChildren = [...branchChildren, ...smallLeafChildren]

    if (dagreChildren.length === 0) continue

    const positions = dagreChildren.map((r) => g.node(r.id)).filter(Boolean)
    if (positions.length === 0) continue

    const minX = Math.min(...positions.map((p) => p.x - NODE_WIDTH / 2)) - GROUP_PAD
    const maxX = Math.max(...positions.map((p) => p.x + NODE_WIDTH / 2)) + GROUP_PAD
    const minY = Math.min(...positions.map((p) => p.y - NODE_HEIGHT / 2)) - GROUP_PAD
    const maxY = Math.max(...positions.map((p) => p.y + NODE_HEIGHT / 2)) + GROUP_PAD

    pushGroup(`group-dagre-${id}`, minX, minY, maxX - minX, maxY - minY)
  }

  // ── 4. Edges for dagre-laid children ─────────────────────────────────────
  for (const [id, emp] of dagreEmployees) {
    const branchChildren = emp.reports.filter((r) => r.reports.length > 0)
    const smallLeafChildren = gridGroups.has(id)
      ? []
      : emp.reports.filter((r) => r.reports.length === 0)

    for (const child of [...branchChildren, ...smallLeafChildren]) {
      flowEdges.push({
        id: `e-${id}-${child.id}`,
        source: id,
        target: child.id,
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
      void fitView({ padding: 0.12, duration: 400 })
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
      fitViewOptions={{ padding: 0.12 }}
      minZoom={0.05}
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
