import type { PlanningRisk } from '../../types/planning'

interface Props {
  risks: PlanningRisk[]
}

const impactColor: Record<string, string> = {
  高: 'text-red-300 bg-red-500/15 border-red-500/30',
  中: 'text-amber-200 bg-amber-500/10 border-amber-500/25',
  低: 'text-blue-200 bg-blue-500/10 border-blue-500/25',
}

export default function RiskMitigationCard({ risks }: Props) {
  return (
    <section className="rounded-2xl border border-blue-500/20 bg-slate-900/60 p-5 sm:p-6">
      <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-blue-100">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500/20 text-sm">6</span>
        风险与备选方案
      </h3>
      <div className="space-y-3">
        {risks.map((r, i) => (
          <div key={`${r.risk}-${i}`} className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium text-slate-200">{r.risk}</p>
              <span
                className={`rounded-full border px-2 py-0.5 text-xs ${impactColor[r.impact] ?? impactColor['中']}`}
              >
                影响：{r.impact}
              </span>
            </div>
            <p className="mt-2 text-sm text-slate-400">
              <span className="text-cyan-400">备选方案：</span>
              {r.mitigation}
            </p>
          </div>
        ))}
      </div>
    </section>
  )
}
