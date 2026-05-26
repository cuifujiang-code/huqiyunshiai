import type { StageGoal } from '../../types/planning'

interface Props {
  stageGoals: StageGoal[]
}

export default function StageGoalsTimeline({ stageGoals }: Props) {
  return (
    <section className="rounded-2xl border border-blue-500/20 bg-slate-900/60 p-5 sm:p-6">
      <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-blue-100">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500/20 text-sm">2</span>
        阶段性目标拆解
      </h3>
      <div className="relative space-y-0 pl-4 sm:pl-6">
        <div className="absolute bottom-2 left-[7px] top-2 w-0.5 bg-gradient-to-b from-blue-500/60 via-cyan-500/40 to-blue-500/20 sm:left-[11px]" />
        {stageGoals.map((goal, index) => (
          <div key={`${goal.period}-${index}`} className="relative pb-6 last:pb-0">
            <div className="absolute -left-4 top-1.5 h-3 w-3 rounded-full border-2 border-cyan-400 bg-slate-950 sm:-left-6 sm:h-4 sm:w-4" />
            <div className="ml-2 rounded-xl border border-slate-700/50 bg-slate-800/30 p-4 transition hover:border-blue-500/30 sm:ml-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-lg bg-blue-500/15 px-2 py-0.5 text-xs font-medium text-cyan-300">
                  {goal.period}
                </span>
                <span className="text-sm font-semibold text-white">{goal.phase}</span>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-medium text-slate-500">核心任务</p>
                  <ul className="mt-1 space-y-1 text-sm text-slate-300">
                    {goal.coreTasks.map((t) => (
                      <li key={t} className="flex gap-1.5">
                        <span className="text-blue-400">·</span>
                        {t}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-500">预期成果</p>
                  <ul className="mt-1 space-y-1 text-sm text-slate-300">
                    {goal.expectedOutcomes.map((o) => (
                      <li key={o} className="flex gap-1.5">
                        <span className="text-cyan-400">✓</span>
                        {o}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
