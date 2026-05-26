import type { WeakPoint } from '../../types/diagnosis'

interface Props {
  points: WeakPoint[]
  expanded: string | null
  onToggle: (id: string) => void
}

const sizes = ['text-sm', 'text-base', 'text-lg', 'text-xl', 'text-2xl']

export default function WeakPointsCard({ points, expanded, onToggle }: Props) {
  const active = points.find((p) => p.id === expanded)
  return (
    <div className="rounded-2xl border border-blue-500/20 bg-slate-900/60 p-5 sm:p-6">
      <h3 className="mb-4 text-base font-semibold text-blue-200">薄弱知识点图谱</h3>
      <div className="flex flex-wrap gap-3">
        {points.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onToggle(p.id)}
            className={`rounded-full border px-3 py-1.5 transition hover:bg-blue-500/20 ${
              expanded === p.id ? 'border-cyan-400 bg-cyan-500/20 text-cyan-200' : 'border-blue-500/30 bg-blue-500/10 text-blue-200'
            } ${sizes[p.weight - 1] ?? 'text-sm'}`}
          >
            {p.name}
          </button>
        ))}
      </div>
      {active && (
        <div className="mt-4 rounded-xl border border-slate-700 bg-slate-800/50 p-4 text-sm text-slate-300">
          <p><span className="font-medium text-red-300">典型错题：</span>{active.typicalWrong}</p>
          <p className="mt-2"><span className="font-medium text-emerald-300">正确解法：</span>{active.correctSolution}</p>
        </div>
      )}
    </div>
  )
}
