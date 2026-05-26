import type { PhaseTaskGroup } from '../../types/planning'

interface Props {
  phaseTasks: PhaseTaskGroup[]
}

export default function TaskListCard({ phaseTasks }: Props) {
  return (
    <section className="rounded-2xl border border-blue-500/20 bg-slate-900/60 p-5 sm:p-6">
      <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-blue-100">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500/20 text-sm">4</span>
        阶段性任务清单
      </h3>
      <div className="space-y-5">
        {phaseTasks.map((group) => (
          <div key={group.phase}>
            <h4 className="mb-3 text-sm font-semibold text-cyan-300">{group.phase}</h4>
            <div className="space-y-3">
              {group.tasks.map((task) => (
                <div
                  key={task.name}
                  className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-4 transition hover:border-blue-500/25"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="font-medium text-white">{task.name}</p>
                    <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-xs text-blue-300">
                      {task.duration}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-400">
                    <span className="text-slate-500">完成标准：</span>
                    {task.criteria}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {task.knowledgePoints.map((kp) => (
                      <span key={kp} className="rounded-md bg-slate-700/50 px-2 py-0.5 text-xs text-slate-300">
                        {kp}
                      </span>
                    ))}
                  </div>
                  {task.relatedExercises.length > 0 && (
                    <p className="mt-2 text-xs text-slate-500">
                      关联练习：{task.relatedExercises.join('、')}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
