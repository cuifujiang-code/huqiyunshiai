import type { PlanningReport } from '../../types/planning'

export default function ScoreAnalysisCard({ report }: { report: PlanningReport }) {
  const analysis = report.scoreAnalysis
  if (!analysis?.summary) return null

  return (
    <div className="rounded-xl border border-blue-500/20 bg-blue-500/[0.06] p-4">
      <h3 className="mb-2 text-sm font-semibold text-blue-200">成绩波动分析</h3>
      <p className="mb-3 text-xs leading-relaxed text-slate-300">{analysis.summary}</p>
      {'subjectInsights' in analysis && Array.isArray(analysis.subjectInsights) && analysis.subjectInsights.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {analysis.subjectInsights.slice(0, 6).map((s) => (
            <div key={s.subject} className="rounded-lg bg-slate-900/50 px-2 py-1.5 text-xs">
              <span className="text-slate-400">{s.subject}</span>
              <span className="ml-2 font-medium text-white">{s.latestScore}</span>
              <span className={`ml-1 ${s.delta >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                ({s.delta >= 0 ? '+' : ''}{s.delta})
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
