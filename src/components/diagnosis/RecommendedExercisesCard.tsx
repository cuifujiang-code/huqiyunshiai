import type { RecommendedExercise } from '../../types/diagnosis'

interface Props {
  exercises: RecommendedExercise[]
  onExportPdf: () => void
  exporting: boolean
}

export default function RecommendedExercisesCard({ exercises, onExportPdf, exporting }: Props) {
  return (
    <div className="rounded-2xl border border-blue-500/20 bg-slate-900/60 p-5 sm:p-6">
      <h3 className="mb-4 text-base font-semibold text-blue-200">推荐练习</h3>
      <div className="space-y-3">
        {exercises.map((ex, i) => (
          <div key={ex.id} className="flex flex-col gap-2 rounded-xl border border-slate-700 bg-slate-800/40 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-slate-200">{i + 1}. {ex.content}</p>
              <p className="mt-1 text-xs text-slate-500">{ex.type} · 难度：{ex.difficulty}</p>
            </div>
            <button type="button" className="shrink-0 rounded-lg bg-blue-600/80 px-4 py-1.5 text-xs text-white hover:bg-blue-500">开始练习</button>
          </div>
        ))}
      </div>
      <button type="button" onClick={onExportPdf} disabled={exporting} className="mt-4 w-full rounded-xl border border-blue-500/40 bg-blue-500/10 py-2.5 text-sm text-blue-200 hover:bg-blue-500/20 disabled:opacity-60">
        {exporting ? '导出中...' : '导出诊断报告 PDF'}
      </button>
    </div>
  )
}
