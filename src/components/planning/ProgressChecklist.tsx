import { useState } from 'react'
import type { PhaseTaskGroup, PhaseTaskItem, PlanningTaskProgress } from '../../types/planning'

interface Props {
  phaseTasks: PhaseTaskGroup[]
  progress?: Record<string, boolean> // key = `${phaseIndex}-${taskIndex}`
  onToggle?: (phaseIndex: number, taskIndex: number) => void
  readOnly?: boolean
  /** 存储在 Supabase 的进度数据 */
  supabaseProgress?: PlanningTaskProgress[]
}

export default function ProgressChecklist({
  phaseTasks,
  progress,
  onToggle,
  readOnly = false,
  supabaseProgress,
}: Props) {
  const [expandedPhases, setExpandedPhases] = useState<Record<number, boolean>>(() => {
    const map: Record<number, boolean> = {}
    phaseTasks.forEach((_, i) => {
      map[i] = true
    })
    return map
  })

  const totalTasks = phaseTasks.reduce((sum, p) => sum + p.tasks.length, 0)
  const completedCount = phaseTasks.reduce((sum, p) => {
    return sum + p.tasks.filter((_, ti) => progress?.[`${phaseTasks.indexOf(p)}-${ti}`]).length
  }, 0)
  const progressPercent = totalTasks > 0 ? Math.round((completedCount / totalTasks) * 100) : 0

  const getProgressKey = (pi: number, ti: number) => `${pi}-${ti}`

  return (
    <div className="rounded-2xl border border-blue-500/20 bg-slate-900/60 p-5">
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-blue-100">阶段任务清单</h3>
          <p className="text-xs text-slate-500">
            {completedCount}/{totalTasks} 项已完成
          </p>
        </div>
        {/* Progress bar */}
        <div className="flex items-center gap-2">
          <div className="h-2 w-28 overflow-hidden rounded-full bg-slate-700/60">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-500 transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <span className="text-sm font-bold text-cyan-300">{progressPercent}%</span>
        </div>
      </div>

      {/* Phase groups */}
      <div className="space-y-3">
        {phaseTasks.map((group, pi) => {
          const phaseCompleted = group.tasks.filter((_, ti) => progress?.[getProgressKey(pi, ti)]).length
          const phaseTotal = group.tasks.length

          return (
            <div key={pi} className="overflow-hidden rounded-xl border border-slate-700/40">
              {/* Phase header */}
              <button
                type="button"
                onClick={() =>
                  setExpandedPhases((prev) => ({ ...prev, [pi]: !prev[pi] }))
                }
                className="flex w-full items-center justify-between bg-slate-800/40 px-4 py-2.5 text-left transition hover:bg-slate-800/60"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`text-xs transition-transform ${expandedPhases[pi] ? 'rotate-90' : ''}`}
                  >
                    ▶
                  </span>
                  <span className="text-sm font-medium text-blue-100">{group.phase}</span>
                  <span className="rounded-full bg-slate-700/60 px-2 py-0.5 text-[10px] text-slate-400">
                    {phaseCompleted}/{phaseTotal}
                  </span>
                </div>
                {phaseCompleted === phaseTotal && phaseTotal > 0 && (
                  <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] text-emerald-300">
                    已完成
                  </span>
                )}
              </button>

              {/* Phase tasks */}
              {expandedPhases[pi] && (
                <div className="divide-y divide-slate-800/50">
                  {group.tasks.map((task, ti) => {
                    const key = getProgressKey(pi, ti)
                    const isCompleted = progress?.[key] ?? false
                    const sp = supabaseProgress?.find(
                      (p) => p.phaseIndex === pi && p.taskIndex === ti,
                    )

                    return (
                      <div
                        key={ti}
                        className={`flex items-start gap-3 px-4 py-2.5 transition ${
                          isCompleted ? 'bg-emerald-500/5' : ''
                        }`}
                      >
                        {/* Checkbox */}
                        <button
                          type="button"
                          disabled={readOnly}
                          onClick={() => onToggle?.(pi, ti)}
                          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition ${
                            readOnly
                              ? 'cursor-default border-slate-600'
                              : 'cursor-pointer border-slate-500 hover:border-cyan-400'
                          } ${
                            isCompleted
                              ? 'border-emerald-500 bg-emerald-500/20'
                              : 'bg-transparent'
                          }`}
                        >
                          {isCompleted && (
                            <svg
                              className="h-3 w-3 text-emerald-300"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={3}
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </button>

                        {/* Task content */}
                        <div className="min-w-0 flex-1">
                          <p
                            className={`text-sm ${
                              isCompleted
                                ? 'text-slate-500 line-through'
                                : 'text-slate-200'
                            }`}
                          >
                            {task.name}
                          </p>
                          <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-500">
                            <span>{task.duration}</span>
                            <span>{task.criteria}</span>
                            {sp?.notes && (
                              <span className="text-amber-400">备注：{sp.notes}</span>
                            )}
                          </div>
                          {task.knowledgePoints.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {task.knowledgePoints.map((kp) => (
                                <span
                                  key={kp}
                                  className="rounded bg-slate-800/80 px-1.5 py-0.5 text-[10px] text-slate-500"
                                >
                                  {kp}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Completed info */}
                        {sp?.completedAt && (
                          <span className="shrink-0 text-[10px] text-slate-600">
                            {new Date(sp.completedAt).toLocaleDateString('zh-CN')}
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {(!readOnly) && (
        <p className="mt-3 text-[10px] text-slate-600">
          勾选任务标记完成进度，教师可在教师端同步查看
        </p>
      )}
    </div>
  )
}
