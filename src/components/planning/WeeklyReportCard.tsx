import type { WeeklyReport } from '../../types/planning'

interface Props {
  report: WeeklyReport
  role?: 'teacher' | 'parent' | 'student'
  onEditTask?: (taskId: string) => void
}

export default function WeeklyReportCard({ report, role = 'student', onEditTask }: Props) {
  const isTeacher = role === 'teacher'
  const isParent = role === 'parent'

  return (
    <div className="rounded-2xl border border-blue-500/20 bg-slate-900/60 p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-blue-100">周报统计</h3>
          <p className="text-xs text-slate-500">
            {report.weekRange?.start} ~ {report.weekRange?.end}
          </p>
        </div>
        <span className="rounded-full bg-blue-500/15 px-3 py-1 text-xs text-blue-200">
          {role === 'parent' ? '家长视图（只读）' : role === 'teacher' ? '教师视图（可编辑）' : '学生视图'}
        </span>
      </div>

      {/* 核心指标 */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricBox label="总任务" value={report.totalTasks} color="text-blue-200" />
        <MetricBox label="已完成" value={report.completedTasks} color="text-emerald-300" />
        <MetricBox label="未完成" value={report.unfinishedTasks} color="text-amber-300" />
        <MetricBox label="延期" value={report.delayedTasks} color="text-red-300" warn={report.delayedTasks > 0} />
      </div>

      {/* 完成率进度条 */}
      <div className="mb-4">
        <div className="mb-1 flex justify-between text-xs">
          <span className="text-slate-400">任务完成率</span>
          <span className="font-bold text-cyan-300">{report.completionRate}%</span>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-slate-700/60">
          <div
            className={`h-full rounded-full transition-all duration-700 ${
              report.completionRate >= 80
                ? 'bg-gradient-to-r from-emerald-500 to-cyan-500'
                : report.completionRate >= 40
                  ? 'bg-gradient-to-r from-amber-500 to-yellow-500'
                  : 'bg-gradient-to-r from-red-500 to-amber-500'
            }`}
            style={{ width: `${report.completionRate}%` }}
          />
        </div>
      </div>

      {/* 分科/分阶段统计 */}
      {report.subjectBreakdown.length > 0 && (
        <div className="mb-4">
          <h4 className="mb-2 text-xs font-medium text-slate-400">分阶段完成率</h4>
          <div className="space-y-1.5">
            {report.subjectBreakdown.map((s) => (
              <div key={s.name} className="flex items-center gap-2">
                <span className="w-24 shrink-0 truncate text-xs text-slate-300">{s.name}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-700/60">
                  <div
                    className={`h-full rounded-full transition-all ${
                      s.rate >= 60 ? 'bg-emerald-500/70' : 'bg-red-500/70'
                    }`}
                    style={{ width: `${s.rate}%` }}
                  />
                </div>
                <span className={`w-10 text-right text-xs ${s.rate < 60 ? 'text-red-400 font-bold' : 'text-slate-500'}`}>
                  {s.rate}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 薄弱预警 */}
      {report.warnings.length > 0 && (
        <div className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 p-3">
          <h4 className="mb-1.5 text-xs font-semibold text-red-300">⚠ 薄弱预警</h4>
          {report.warnings.map((w, i) => (
            <p key={i} className="text-xs text-red-200/80">{w.message}</p>
          ))}
        </div>
      )}

      {/* 未完成清单 */}
      {report.unfinishedList.length > 0 && (
        <div>
          <h4 className="mb-2 text-xs font-medium text-slate-400">未完成任务清单</h4>
          <div className="max-h-48 overflow-y-auto space-y-1">
            {report.unfinishedList.map((t) => (
              <div
                key={t.taskId}
                className={`flex items-center justify-between rounded-lg px-3 py-1.5 text-xs ${
                  t.status === 'delay' ? 'bg-red-500/10' : 'bg-slate-800/40'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`inline-block h-1.5 w-1.5 rounded-full ${
                    t.status === 'delay' ? 'bg-red-400' : 'bg-amber-400'
                  }`} />
                  <span className="truncate text-slate-300">{t.taskName}</span>
                  <span className="shrink-0 text-slate-600">{t.stageName}</span>
                </div>
                {isTeacher && onEditTask && (
                  <button
                    type="button"
                    onClick={() => onEditTask(t.taskId)}
                    className="ml-2 shrink-0 rounded border border-blue-500/30 px-2 py-0.5 text-[10px] text-blue-300 hover:bg-blue-500/20"
                  >
                    编辑
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 教师端编辑提示 */}
      {isTeacher && (
        <p className="mt-4 text-[10px] text-slate-600">
          教师可点击"编辑"按钮调整任务计划，修改结果将实时同步到学生端
        </p>
      )}
      {isParent && (
        <p className="mt-4 text-[10px] text-slate-600">
          此为只读视图，如需调整学习计划请联系老师
        </p>
      )}
    </div>
  )
}

function MetricBox({ label, value, color, warn }: { label: string; value: number; color: string; warn?: boolean }) {
  return (
    <div className={`rounded-xl border p-3 text-center ${warn ? 'border-red-500/30 bg-red-500/5' : 'border-slate-700/40 bg-slate-800/40'}`}>
      <p className="text-xl font-bold">{value}</p>
      <p className={`text-[10px] ${color}`}>{label}</p>
    </div>
  )
}
