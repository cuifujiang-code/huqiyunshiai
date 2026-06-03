import type { MonthlyReport } from '../../types/planning'

interface Props {
  report: MonthlyReport
  role?: 'teacher' | 'parent' | 'student'
}

export default function MonthlyReportCard({ report, role = 'student' }: Props) {
  const isParent = role === 'parent'

  return (
    <div className="rounded-2xl border border-blue-500/20 bg-slate-900/60 p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-blue-100">月度报告</h3>
          <p className="text-xs text-slate-500">{report.month}</p>
        </div>
        <span className="rounded-full bg-violet-500/15 px-3 py-1 text-xs text-violet-200">
          {isParent ? '家长视图' : '完整视图'}
        </span>
      </div>

      {/* 核心指标 */}
      <div className="mb-4 grid grid-cols-3 gap-3">
        <MonthlyMetric label="总任务" value={report.totalTasks} />
        <MonthlyMetric label="已完成" value={report.completedTasks} color="text-emerald-300" />
        <MonthlyMetric label="完成率" value={`${report.completionRate}%`} color="text-cyan-300" />
      </div>

      {/* 完成率大圆环 */}
      <div className="mb-5 flex items-center gap-6">
        <div className="relative h-20 w-20 shrink-0">
          <svg className="h-full w-full -rotate-90" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="42" fill="none" stroke="currentColor"
              className="text-slate-700" strokeWidth="8" />
            <circle cx="50" cy="50" r="42" fill="none" stroke="currentColor"
              className={`${report.completionRate >= 60 ? 'text-emerald-400' : 'text-amber-400'}`}
              strokeWidth="8" strokeLinecap="round"
              strokeDasharray={`${report.completionRate * 2.64} 264`} />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-base font-bold text-cyan-300">
            {report.completionRate}%
          </span>
        </div>
        <div className="text-xs text-slate-400">
          <p>知识点落地覆盖率：<span className="text-blue-200">{report.knowledgeCoverage}%</span></p>
          <p className="mt-0.5">
            达标任务：
            <span className="text-emerald-300">{report.standardMet}</span>
            <span className="text-slate-600">/{report.standardTotal}</span>
          </p>
        </div>
      </div>

      {/* 分阶段进度 */}
      {report.stageProgress.length > 0 && (
        <div className="mb-4">
          <h4 className="mb-2 text-xs font-medium text-slate-400">各阶段完成进度</h4>
          {report.stageProgress.map((s) => (
            <div key={s.stageName} className="mb-2 flex items-center gap-2">
              <span className="w-24 shrink-0 truncate text-xs text-slate-300">{s.stageName}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-700/60">
                <div
                  className={`h-full rounded-full ${
                    s.rate >= 80 ? 'bg-emerald-500' : s.rate >= 40 ? 'bg-amber-500' : 'bg-red-500'
                  }`}
                  style={{ width: `${s.rate}%` }}
                />
              </div>
              <span className="w-16 text-right text-xs text-slate-500">{s.completed}/{s.total} ({s.rate}%)</span>
            </div>
          ))}
        </div>
      )}

      {/* 智能建议 */}
      {report.suggestions.length > 0 && (
        <div className="rounded-lg border border-violet-500/20 bg-violet-500/10 p-3">
          <h4 className="mb-1.5 text-xs font-semibold text-violet-300">下月补强建议</h4>
          <ul className="space-y-1">
            {report.suggestions.map((s, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs text-violet-200/80">
                <span className="mt-0.5 text-violet-400">•</span>
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      {isParent && (
        <p className="mt-4 text-[10px] text-slate-600">此报告仅供参考，详细数据请联系授课老师</p>
      )}
    </div>
  )
}

function MonthlyMetric({ label, value, color = 'text-blue-200' }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="rounded-xl border border-slate-700/40 bg-slate-800/40 p-3 text-center">
      <p className={`text-lg font-bold ${color}`}>{value}</p>
      <p className="text-[10px] text-slate-500">{label}</p>
    </div>
  )
}
