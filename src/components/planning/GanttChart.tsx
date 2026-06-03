import { useMemo } from 'react'
import type { GanttData, GanttTaskItem, PlanRouteCode } from '../../types/planning'
import { PLAN_ROUTES } from '../../types/planning'

interface Props {
  ganttData: GanttData | null
  onTaskClick?: (taskId: string) => void
  readOnly?: boolean
}

const STATUS_COLORS: Record<string, string> = {
  unfinish: 'bg-slate-500/50',
  doing: 'bg-blue-500/60',
  finish: 'bg-emerald-500/60',
  delay: 'bg-red-500/60',
}

const STATUS_LABELS: Record<string, string> = {
  unfinish: '未开始',
  doing: '进行中',
  finish: '已完成',
  delay: '已延期',
}

const STAGE_COLORS = [
  'border-l-emerald-400',
  'border-l-cyan-400',
  'border-l-amber-400',
]

export default function GanttChart({ ganttData, onTaskClick, readOnly }: Props) {
  const routeLabel = useMemo(() => {
    if (!ganttData?.taskList?.[0]) return ''
    const rt = ganttData.taskList[0].routeType
    const route = PLAN_ROUTES.find((r) => r.code === rt)
    return route?.name || rt
  }, [ganttData])

  const stages = useMemo(() => {
    if (!ganttData?.taskList) return []
    const map = new Map<string, GanttTaskItem[]>()
    ganttData.taskList.forEach((t) => {
      const key = t.stageName || '未分类'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(t)
    })
    return Array.from(map.entries())
  }, [ganttData])

  if (!ganttData || !ganttData.taskList || ganttData.taskList.length === 0) {
    return (
      <div className="rounded-2xl border border-blue-500/20 bg-slate-900/60 p-6 text-center">
        <h3 className="mb-2 text-sm font-semibold text-blue-100">阶段任务甘特图</h3>
        <p className="text-xs text-slate-500">暂无任务数据，请先生成规划</p>
      </div>
    )
  }

  // 计算时间范围
  const allDates = ganttData.taskList.flatMap((t) => [new Date(t.startDate), new Date(t.endDate)])
  const minDate = new Date(Math.min(...allDates.map((d) => d.getTime())))
  const maxDate = new Date(Math.max(...allDates.map((d) => d.getTime())))
  const totalDays = Math.max((maxDate.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24), 1)
  const totalWeeks = Math.ceil(totalDays / 7) + 1

  const getLeftPct = (dateStr: string) => {
    const d = new Date(dateStr)
    return ((d.getTime() - minDate.getTime()) / (maxDate.getTime() - minDate.getTime())) * 100
  }

  const getWidthPct = (start: string, end: string) => {
    const s = new Date(start).getTime()
    const e = new Date(end).getTime()
    return Math.max(((e - s) / (maxDate.getTime() - minDate.getTime())) * 100, 1.5)
  }

  const stats = {
    total: ganttData.taskList.length,
    finished: ganttData.taskList.filter((t) => t.status === 'finish').length,
    doing: ganttData.taskList.filter((t) => t.status === 'doing').length,
    delayed: ganttData.taskList.filter((t) => t.status === 'delay').length,
  }

  return (
    <div className="rounded-2xl border border-blue-500/20 bg-slate-900/60 p-5">
      {/* Header */}
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-blue-100">{ganttData.planName} · 甘特图</h3>
          <p className="text-xs text-slate-500">
            {routeLabel} · {ganttData.planStartDate} ~ {ganttData.planEndDate || '进行中'}
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="text-slate-400">
            总计 <strong className="text-blue-200">{stats.total}</strong>
          </span>
          <span className="text-emerald-400">
            完成 <strong>{stats.finished}</strong>
          </span>
          <span className="text-blue-400">
            进行中 <strong>{stats.doing}</strong>
          </span>
          {stats.delayed > 0 && (
            <span className="text-red-400">
              延期 <strong>{stats.delayed}</strong>
            </span>
          )}
        </div>
      </div>

      {/* 状态图例 */}
      <div className="mb-4 flex flex-wrap gap-3 text-[10px] text-slate-500">
        {Object.entries(STATUS_COLORS).map(([key, color]) => (
          <span key={key} className="flex items-center gap-1">
            <span className={`inline-block h-2.5 w-2.5 rounded-sm ${color}`} />
            {STATUS_LABELS[key] || key}
          </span>
        ))}
      </div>

      <div className="overflow-x-auto">
        <div style={{ minWidth: 720 }}>
          {/* 周标尺 */}
          <div className="mb-2 flex" style={{ paddingLeft: 150 }}>
            {Array.from({ length: Math.min(totalWeeks, 52) }).map((_, i) => (
              <div key={i} className="flex-1 text-center text-[9px] text-slate-600">
                {i % 4 === 0 ? `第${i + 1}周` : ''}
              </div>
            ))}
          </div>

          {/* 按阶段分组渲染 */}
          {stages.map(([stageName, stageTasks], si) => (
            <div key={stageName} className="mb-3">
              {/* 阶段标题 */}
              <div className={`mb-1 border-l-2 ${STAGE_COLORS[si % 3]} pl-2`}>
                <span className="text-xs font-medium text-slate-300">{stageName}</span>
                <span className="ml-2 text-[10px] text-slate-600">
                  {stageTasks.length} 项 ·{' '}
                  {stageTasks.filter((t) => t.status === 'finish').length} 完成
                </span>
              </div>

              {/* 阶段内任务 */}
              {stageTasks.map((task) => (
                <div key={task.taskId} className="group mb-1 flex items-center rounded-lg">
                  {/* 任务名称 */}
                  <button
                    type="button"
                    className="w-[150px] shrink-0 truncate pr-2 text-right text-xs"
                    onClick={onTaskClick ? () => onTaskClick(task.taskId) : undefined}
                    title={`${task.taskName}\n${task.startDate} ~ ${task.endDate}`}
                  >
                    <span
                      className={`${
                        task.status === 'finish'
                          ? 'text-emerald-400 line-through'
                          : task.status === 'delay'
                            ? 'text-red-400'
                            : 'text-slate-300'
                      } transition`}
                    >
                      {task.status === 'finish' && '✓ '}
                      {task.taskName.length > 18 ? task.taskName.slice(0, 18) + '…' : task.taskName}
                    </span>
                  </button>

                  {/* 甘特条区域 */}
                  <div className="relative flex-1" style={{ height: 24 }}>
                    {/* 网格 */}
                    <div className="absolute inset-0 flex">
                      {Array.from({ length: Math.min(totalWeeks, 52) }).map((_, i) => (
                        <div
                          key={i}
                          className={`flex-1 border-l ${
                            i % 4 === 0 ? 'border-slate-700/40' : 'border-slate-800/30'
                          }`}
                        />
                      ))}
                    </div>

                    {/* 进度条 */}
                    <div
                      className={`absolute top-1/2 -translate-y-1/2 rounded-full transition-all ${
                        STATUS_COLORS[task.status] || 'bg-slate-500/50'
                      } ${!readOnly && onTaskClick ? 'cursor-pointer hover:brightness-125' : ''}`}
                      style={{
                        left: `${getLeftPct(task.startDate)}%`,
                        width: `${getWidthPct(task.startDate, task.endDate)}%`,
                        height: 16,
                        minWidth: 6,
                      }}
                      onClick={!readOnly && onTaskClick ? () => onTaskClick(task.taskId) : undefined}
                      title={`${task.taskName}\n${task.startDate} ~ ${task.endDate}\n${STATUS_LABELS[task.status]} · ${task.completeRate}%`}
                    >
                      {/* 完成率内嵌 */}
                      {task.completeRate > 0 && task.completeRate < 100 && (
                        <div
                          className="absolute inset-y-0 left-0 rounded-full bg-emerald-400/80"
                          style={{ width: `${task.completeRate}%` }}
                        />
                      )}
                    </div>
                  </div>

                  {/* 进度百分比 */}
                  <span className="ml-2 w-10 shrink-0 text-right text-[10px] text-slate-500">
                    {task.completeRate}%
                  </span>

                  {/* 串行/并行标记 */}
                  <span className="ml-1 shrink-0 text-[9px] text-slate-600" title={task.isParallel ? '并行任务' : '串行任务'}>
                    {task.isParallel ? '∥' : '→'}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
