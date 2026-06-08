import type { PlanningReport } from '../../types/planning'

export default function OrchestrationMetaCard({ report }: { report: PlanningReport }) {
  const meta = report.orchestrationMeta
  if (!meta?.providersUsed?.length) return null

  return (
    <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/[0.05] p-4">
      <h3 className="mb-2 text-sm font-semibold text-cyan-200">多 AI 协同审查</h3>
      <p className="mb-2 text-xs text-slate-400">
        参与角色：{meta.providersUsed.join(' → ')}
        {meta.reviewRequired && (
          <span className="ml-2 text-amber-400">（经质检修订）</span>
        )}
      </p>
      {meta.finalNotes && (
        <p className="mb-2 text-xs text-slate-300">{meta.finalNotes}</p>
      )}
      {meta.reviewerNotes && meta.reviewerNotes.length > 0 && (
        <ul className="list-inside list-disc text-xs text-amber-200/80">
          {meta.reviewerNotes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
