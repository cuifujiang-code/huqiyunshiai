import type { PlanDay } from '../../types/diagnosis'

interface Props {
  plan: PlanDay[]
  planTasks: Record<string, boolean>
  onToggleTask: (taskId: string) => void
}

export default function ImprovementPlanCard({ plan, planTasks, onToggleTask }: Props) {
  return (
    <div className="rounded-2xl border border-blue-500/20 bg-slate-900/60 p-5 sm:p-6">
      <h3 className="mb-4 text-base font-semibold text-blue-200">个性化提升计划（未来两周）</h3>
      <div className="relative space-y-6 border-l-2 border-blue-500/30 pl-6">
        {plan.map((day) => (
          <div key={day.day} className="relative">
            <span className="absolute -left-[1.6rem] top-1 h-3 w-3 rounded-full bg-cyan-400" />
            <p className="text-sm font-semibold text-cyan-300">{day.day}</p>
            <ul className="mt-2 space-y-2">
              {day.tasks.map((task) => (
                <li key={task.id} className="flex items-start gap-2 text-sm text-slate-300">
                  <input
                    type="checkbox"
                    checked={!!planTasks[task.id]}
                    onChange={() => onToggleTask(task.id)}
                    className="mt-1 h-4 w-4 rounded border-slate-600 bg-slate-800 text-blue-500"
                  />
                  <span className={planTasks[task.id] ? 'line-through opacity-60' : ''}>{task.text}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}
