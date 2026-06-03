import type { RefObject } from 'react'
import type { PlanningReport, GanttTask, PlanningTaskProgress } from '../../types/planning'
import PlanningReportView from './PlanningReportView'

interface Props {
  report: PlanningReport | null
  loading: boolean
  message: string | null
  isWarning?: boolean
  reportRef: RefObject<HTMLDivElement | null>
  onExportPdf?: () => void
  onSave?: () => void
  exporting?: boolean
  saving?: boolean
  saved?: boolean
  /** 甘特图数据 */
  ganttTasks?: GanttTask[]
  /** 任务进度 */
  checklistProgress?: Record<string, boolean>
  onChecklistToggle?: (phaseIndex: number, taskIndex: number) => void
  supabaseProgress?: PlanningTaskProgress[]
  onGanttToggle?: (taskId: string) => void
}

export default function PlanningPreviewPanel({
  report,
  loading,
  message,
  isWarning = false,
  reportRef,
  onExportPdf,
  onSave,
  exporting = false,
  saving = false,
  saved = false,
  ganttTasks,
  checklistProgress,
  onChecklistToggle,
  supabaseProgress,
  onGanttToggle,
}: Props) {
  return (
    <div className="flex min-h-[480px] flex-col rounded-2xl border border-blue-500/20 bg-slate-900/60 p-5 sm:min-h-[calc(100vh-140px)] sm:p-6">
      {message && (
        <p
          className={`mb-4 rounded-lg border px-3 py-2 text-sm ${
            isWarning
              ? 'border-amber-500/40 bg-amber-500/15 text-amber-200'
              : 'border-blue-500/30 bg-blue-500/10 text-blue-200'
          }`}
        >
          {message}
        </p>
      )}

      {loading && (
        <div className="flex flex-1 flex-col items-center justify-center py-16">
          <div className="relative h-16 w-16">
            <div className="absolute inset-0 animate-spin rounded-full border-2 border-blue-500/20 border-t-cyan-400" />
            <div className="absolute inset-2 animate-pulse rounded-full bg-blue-500/10" />
          </div>
          <p className="mt-6 text-sm text-blue-200">AI 正在分析学生画像，生成专属规划方案…</p>
          <div className="mt-4 flex gap-1">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="h-1.5 w-1.5 animate-bounce rounded-full bg-cyan-400"
                style={{ animationDelay: `${i * 150}ms` }}
              />
            ))}
          </div>
        </div>
      )}

      {!loading && !report && (
        <div className="flex flex-1 flex-col items-center justify-center py-16 text-center">
          <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-2xl border border-blue-500/20 bg-blue-500/10 text-4xl">
            🎯
          </div>
          <p className="max-w-sm text-slate-400">
            请输入学生信息，AI 将为您生成专属教育规划方案
          </p>
        </div>
      )}

      {!loading && report && (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold text-blue-100">{report.title}</h2>
              <p className="text-xs text-slate-500">
                生成时间：{new Date(report.generatedAt).toLocaleString('zh-CN')}
                {report.source === 'mock' && ' · 示例数据'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {onSave && (
                <button
                  type="button"
                  onClick={onSave}
                  disabled={saving || saved}
                  className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-1.5 text-xs text-blue-200 hover:bg-blue-500/20 disabled:opacity-60"
                >
                  {saved ? '已保存' : saving ? '保存中…' : '保存方案'}
                </button>
              )}
              {onExportPdf && (
                <button
                  type="button"
                  onClick={onExportPdf}
                  disabled={exporting}
                  className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-xs text-cyan-200 hover:bg-cyan-500/20 disabled:opacity-60"
                >
                  {exporting ? '导出中…' : '导出 PDF'}
                </button>
              )}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto pr-1">
            <PlanningReportView
              report={report}
              reportRef={reportRef}
              ganttTasks={ganttTasks}
              checklistProgress={checklistProgress}
              onChecklistToggle={onChecklistToggle}
              supabaseProgress={supabaseProgress}
              onGanttToggle={onGanttToggle}
            />
          </div>
        </>
      )}
    </div>
  )
}
