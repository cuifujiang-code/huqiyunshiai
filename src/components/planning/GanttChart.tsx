import { useMemo } from 'react'
import type { GanttTask } from '../../types/planning'

interface Props {
  tasks: GanttTask[]
  onToggle?: (taskId: string) => void
  readOnly?: boolean
}

const PHASE_COLORS: Record<string, string> = {
  '夯实基础': 'bg-emerald-500/60',
  '能力提升': 'bg-cyan-500/60',
  '强化冲刺': 'bg-amber-500/60',
  '模拟演练': 'bg-violet-500/60',
  '考前调整': 'bg-pink-500/60',
}

function getPhaseColor(phase: string): string {
  for (const [key, color] of Object.entries(PHASE_COLORS)) {
    if (phase.includes(key)) return color
  }
  return 'bg-blue-500/60'
}

/** 从阶段名称推算相对周偏移 */
function phaseWeekOffset(phase: string): number {
  const map: Record<string, number> = { '夯实基础': 0, '能力提升': 12, '强化冲刺': 24, '模拟演练': 32, '考前调整': 40 }
  for (const [key, offset] of Object.entries(map)) {
    if (phase.includes(key)) return offset
  }
  return 0
}

export default function GanttChart({ tasks, onToggle, readOnly }: Props) {
  const { totalWeeks, rows } = useMemo(() => {
    if (tasks.length === 0) return { totalWeeks: 52, rows: [] }

    // Find date range
    let minDate = Infinity
    let maxDate = -Infinity
    const parsed = tasks.map((t) => {
      const s = new Date(t.startDate).getTime()
      const e = new Date(t.endDate).getTime()
      if (s < minDate) minDate = s
      if (e > maxDate) maxDate = e
      return { ...t, start: s, end: e }
    })

    const rangeDays = Math.max((maxDate - minDate) / (1000 * 60 * 60 * 24), 1)
    const totalWeeks = Math.ceil(rangeDays / 7) + 1

    const rows = parsed.map((t) => {
      const leftPct = ((t.start - minDate) / (maxDate - minDate)) * 100
      const widthPct = Math.max(((t.end - t.start) / (maxDate - minDate)) * 100, 2)
      return { ...t, leftPct, widthPct }
    })

    return { totalWeeks, rows }
  }, [tasks])

  if (tasks.length === 0) {
    return (
      <div className="rounded-2xl border border-blue-500/20 bg-slate-900/60 p-6 text-center">
        <h3 className="mb-2 text-sm font-semibold text-blue-100">阶段任务甘特图</h3>
        <p className="text-xs text-slate-500">生成规划后可查看甘特图</p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-blue-500/20 bg-slate-900/60 p-5">
      <h3 className="mb-1 text-sm font-semibold text-blue-100">阶段任务甘特图</h3>
      <p className="mb-4 text-xs text-slate-500">从当前到目标考试的关键时间节点</p>

      <div className="overflow-x-auto">
        <div style={{ minWidth: 640 }}>
          {/* Header: month markers */}
          <div className="mb-2 flex" style={{ paddingLeft: 140 }}>
            {Array.from({ length: Math.min(totalWeeks, 52) }).map((_, i) => (
              <div key={i} className="flex-1 text-center text-[9px] text-slate-600">
                {i % 4 === 0 ? `第${i + 1}周` : ''}
              </div>
            ))}
          </div>

          {/* Rows */}
          {rows.map((task) => (
            <div key={task.id} className="group mb-1.5 flex items-center rounded-lg">
              {/* Label */}
              <button
                type="button"
                className="w-[140px] shrink-0 truncate pr-2 text-right text-xs"
                onClick={onToggle ? () => onToggle(task.id) : undefined}
                title={task.name}
              >
                <span
                  className={`${task.completed ? 'text-emerald-400 line-through' : 'text-slate-300'} transition`}
                >
                  {task.completed && '✓ '}
                  {task.name}
                </span>
              </button>

              {/* Bar area */}
              <div className="relative flex-1" style={{ height: 22 }}>
                {/* Background grid */}
                <div className="absolute inset-0 flex">
                  {Array.from({ length: Math.min(totalWeeks, 52) }).map((_, i) => (
                    <div
                      key={i}
                      className={`flex-1 border-l ${
                        i % 4 === 0 ? 'border-slate-700/50' : 'border-slate-800/40'
                      }`}
                    />
                  ))}
                </div>

                {/* Task bar */}
                <div
                  className={`absolute top-1/2 -translate-y-1/2 rounded-full transition-all ${
                    task.completed
                      ? 'bg-emerald-500/40'
                      : `${getPhaseColor(task.phase)} hover:brightness-125`
                  } ${onToggle && !readOnly ? 'cursor-pointer' : ''}`}
                  style={{
                    left: `${task.leftPct}%`,
                    width: `${task.widthPct}%`,
                    height: 16,
                    minWidth: 8,
                  }}
                  onClick={onToggle && !readOnly ? () => onToggle(task.id) : undefined}
                  title={`${task.phase} · ${task.startDate} ~ ${task.endDate}`}
                />
              </div>

              {/* Phase badge */}
              <span className="ml-2 shrink-0 rounded-full bg-slate-800/80 px-2 py-0.5 text-[10px] text-slate-500">
                {task.phase}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap gap-3 text-[10px] text-slate-500">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-500/60" /> 夯实基础
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-cyan-500/60" /> 能力提升
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-amber-500/60" /> 强化冲刺
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-violet-500/60" /> 模拟演练
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-pink-500/60" /> 考前调整
        </span>
      </div>
    </div>
  )
}
