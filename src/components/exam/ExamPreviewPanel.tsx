import type { ExamPaper as ExamPaperType } from '../../types/exam'
import ExamPaper from './ExamPaper'

interface ExamPreviewPanelProps {
  exam: ExamPaperType | null
  loading: boolean
  message: string | null
  isError?: boolean
  isWarning?: boolean
  paperRef: React.RefObject<HTMLDivElement | null>
  onExportPdf: () => void
  onSave: () => void
  exporting: boolean
  saving: boolean
  saved: boolean
}

function EmptyState() {
  return (
    <div className="flex h-full min-h-[400px] flex-col items-center justify-center rounded-2xl border border-dashed border-blue-500/30 bg-slate-900/40 p-8 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-blue-500/10">
        <svg className="h-10 w-10 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
        </svg>
      </div>
      <p className="mt-6 text-base text-slate-400">您的试卷将在这里实时展示</p>
    </div>
  )
}

function LoadingState() {
  return (
    <div className="flex h-full min-h-[400px] flex-col items-center justify-center gap-4">
      <Spinner />
      <p className="animate-pulse text-sm text-slate-400">AI 正在为您生成试卷，请稍候...</p>
    </div>
  )
}

function Spinner() {
  return (
    <div className="h-12 w-12 animate-spin rounded-full border-4 border-blue-500/30 border-t-blue-400" />
  )
}

export default function ExamPreviewPanel({
  exam,
  loading,
  message,
  isError = false,
  isWarning = false,
  paperRef,
  onExportPdf,
  onSave,
  exporting,
  saving,
  saved,
}: ExamPreviewPanelProps) {
  return (
    <div className="flex h-full flex-col rounded-2xl border border-blue-500/20 bg-slate-900/60 p-5 shadow-xl shadow-blue-900/10 sm:p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-blue-100">试卷实时预览</h2>
        {exam?.source === 'mock' && (
          <span className="rounded-full bg-amber-500/20 px-3 py-1 text-xs text-amber-300">演示数据</span>
        )}
        {exam?.source === 'ai' && (
          <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs text-emerald-300">AI 生成</span>
        )}
      </div>

      {message && (
        <p
          className={`mb-4 rounded-lg border px-3 py-2 text-sm ${
            isError
              ? 'border-red-500/30 bg-red-500/10 text-red-300'
              : isWarning
                ? 'border-amber-500/40 bg-amber-500/15 text-amber-200'
                : 'border-blue-500/30 bg-blue-500/10 text-blue-200'
          }`}
        >
          {message}
        </p>
      )}

      <div className="flex-1 overflow-auto">
        {loading ? (
          <LoadingState />
        ) : exam ? (
          <ExamPaper
            exam={exam}
            paperRef={paperRef}
            onExportPdf={onExportPdf}
            onSave={onSave}
            exporting={exporting}
            saving={saving}
            saved={saved}
          />
        ) : (
          <EmptyState />
        )}
      </div>
    </div>
  )
}
