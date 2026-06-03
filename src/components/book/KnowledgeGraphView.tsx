import type { KnowledgeGraph } from '../../types/teacher'

interface Props {
  graph: KnowledgeGraph | null
  loading?: boolean
}

export default function KnowledgeGraphView({ graph, loading }: Props) {
  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center rounded-xl border border-slate-700 bg-slate-800/40 text-sm text-slate-400">
        AI 正在生成知识网络图…
      </div>
    )
  }

  if (!graph?.nodes?.length) {
    return (
      <div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-slate-600 text-sm text-slate-500">
        从题库选题后，点击「生成知识网络图」
      </div>
    )
  }

  const n = graph.nodes.length
  const radius = 100
  const cx = 160
  const cy = 120

  const positions = graph.nodes.map((node, i) => {
    const angle = (2 * Math.PI * i) / n - Math.PI / 2
    return {
      node,
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
    }
  })

  const posMap = Object.fromEntries(positions.map((p) => [p.node.id, p]))

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800/30 p-4">
      <h4 className="mb-3 text-sm font-semibold text-cyan-200">知识网络图</h4>
      <svg viewBox="0 0 320 240" className="mx-auto w-full max-w-md">
        {(graph.edges ?? []).map((e, i) => {
          const from = posMap[e.from]
          const to = posMap[e.to]
          if (!from || !to) return null
          return (
            <line
              key={i}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              stroke="#64748b"
              strokeWidth={1.5}
              markerEnd="url(#arrow)"
            />
          )
        })}
        <defs>
          <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 Z" fill="#64748b" />
          </marker>
        </defs>
        {positions.map(({ node, x, y }) => (
          <g key={node.id}>
            <rect x={x - 52} y={y - 14} width={104} height={28} rx={6} fill="#1e3a5f" stroke="#3b82f6" strokeWidth={1.5} />
            <text x={x} y={y + 4} textAnchor="middle" fill="#e2e8f0" fontSize={10}>
              {node.label.length > 8 ? `${node.label.slice(0, 7)}…` : node.label}
            </text>
          </g>
        ))}
      </svg>
      <ul className="mt-2 space-y-1 text-xs text-slate-400">
        {(graph.edges ?? []).slice(0, 8).map((e, i) => {
          const from = graph.nodes.find((n) => n.id === e.from)?.label
          const to = graph.nodes.find((n) => n.id === e.to)?.label
          return (
            <li key={i}>
              {from} → {to}
              {e.label ? `（${e.label}）` : ''}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
