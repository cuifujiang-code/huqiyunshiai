import type { LossReasonItem } from '../../types/diagnosis'

export default function LossAnalysisCard({ items }: { items: LossReasonItem[] }) {
  return (
    <div className="rounded-2xl border border-blue-500/20 bg-slate-900/60 p-5 sm:p-6">
      <h3 className="mb-4 text-base font-semibold text-blue-200">失分归因分析</h3>
      <div className="space-y-4">
        {items.map((item) => (
          <div key={item.type}>
            <div className="mb-1 flex justify-between text-sm">
              <span className="text-slate-200">{item.label}</span>
              <span className="font-medium" style={{ color: item.color }}>{item.percentage}%</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-slate-800">
              <div className="h-full rounded-full transition-all duration-700" style={{ width: `${item.percentage}%`, backgroundColor: item.color }} />
            </div>
            <p className="mt-1.5 text-xs text-slate-400">{item.explanation}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
