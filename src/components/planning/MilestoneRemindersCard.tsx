import type { PlanningMilestone } from '../../types/planning'

interface Props {
  milestones: PlanningMilestone[]
}

export default function MilestoneRemindersCard({ milestones }: Props) {
  return (
    <section className="rounded-2xl border border-blue-500/20 bg-slate-900/60 p-5 sm:p-6">
      <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-blue-100">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500/20 text-sm">5</span>
        关键节点提醒
      </h3>
      <div className="grid gap-3 sm:grid-cols-2">
        {milestones.map((m) => (
          <div
            key={`${m.date}-${m.event}`}
            className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4"
          >
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-200">
                {m.date}
              </span>
              <span className="text-sm font-semibold text-white">{m.event}</span>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">{m.preparationAdvice}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
