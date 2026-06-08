import type { FiveStagePlanItem } from '../../types/planning'

interface Props {
  stages: FiveStagePlanItem[]
  citation?: string
}

export default function FiveStagePlanningTimeline({ stages, citation }: Props) {
  if (!stages?.length) return null

  return (
    <section className="rounded-2xl border border-indigo-500/25 bg-indigo-500/[0.06] p-5 sm:p-6">
      <h3 className="mb-1 flex items-center gap-2 text-lg font-semibold text-indigo-200">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-500/25 text-sm">5</span>
        五阶段升学规划（数据驱动）
      </h3>
      {citation && (
        <p className="mb-4 text-[10px] text-indigo-300/70">{citation}</p>
      )}
      <div className="relative space-y-0 pl-4 sm:pl-6">
        <div className="absolute bottom-2 left-[7px] top-2 w-0.5 bg-gradient-to-b from-indigo-500/60 to-purple-500/30 sm:left-[11px]" />
        {stages.map((stage) => (
          <div key={stage.stage} className="relative pb-5 last:pb-0">
            <div className="absolute -left-4 top-1.5 flex h-6 w-6 items-center justify-center rounded-full border-2 border-indigo-400 bg-slate-950 text-[10px] font-bold text-indigo-300 sm:-left-6">
              {stage.stage}
            </div>
            <div className="ml-2 rounded-xl border border-indigo-500/15 bg-slate-900/40 p-4 sm:ml-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-white">{stage.name}</span>
                <span className="rounded bg-indigo-500/15 px-2 py-0.5 text-[10px] text-indigo-300">
                  {stage.period}
                </span>
                {stage.durationWeeks != null && (
                  <span className="text-[10px] text-slate-500">{stage.durationWeeks} 周</span>
                )}
              </div>
              {stage.objectives?.length > 0 && (
                <div className="mt-2">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">阶段目标</p>
                  <ul className="mt-1 space-y-0.5 text-xs text-slate-300">
                    {stage.objectives.map((o) => (
                      <li key={o}>· {o}</li>
                    ))}
                  </ul>
                </div>
              )}
              {stage.coreTasks?.length > 0 && (
                <div className="mt-2">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">核心任务</p>
                  <ul className="mt-1 space-y-0.5 text-xs text-slate-300">
                    {stage.coreTasks.map((t) => (
                      <li key={t}>→ {t}</li>
                    ))}
                  </ul>
                </div>
              )}
              {stage.calibrationCheckpoint && (
                <p className="mt-2 text-[10px] text-amber-400/90">
                  校准点：{stage.calibrationCheckpoint}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
