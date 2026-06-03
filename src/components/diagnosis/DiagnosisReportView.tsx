import { useState } from 'react'
import type { DiagnosisHistoryItem, DiagnosisReport, ClassComparison } from '../../types/diagnosis'
import ScoreOverviewCard from './ScoreOverviewCard'
import LossAnalysisCard from './LossAnalysisCard'
import WeakPointsCard from './WeakPointsCard'
import WrongQuestionsCard from './WrongQuestionsCard'
import ImprovementPlanCard from './ImprovementPlanCard'
import RecommendedExercisesCard from './RecommendedExercisesCard'
import ProgressTrendChart from './ProgressTrendChart'
import ClassComparisonCard from './ClassComparisonCard'

interface Props {
  report: DiagnosisReport
  reportRef: React.RefObject<HTMLDivElement | null>
  onExportPdf: () => void
  onShare: () => void
  onBackHome: () => void
  exporting: boolean
  planTasks: Record<string, boolean>
  onToggleTask: (taskId: string) => void
  /** 历史诊断摘要 — 用于进步趋势图 */
  diagnosisHistory?: DiagnosisHistoryItem[]
  /** 班级/年级对比数据 */
  classComparison?: ClassComparison
}

export default function DiagnosisReportView({
  report, reportRef, onExportPdf, onShare, onBackHome, exporting, planTasks, onToggleTask,
  diagnosisHistory, classComparison,
}: Props) {
  const [expandedPoint, setExpandedPoint] = useState<string | null>(null)

  return (
    <div ref={reportRef} className="mx-auto max-w-3xl space-y-5 pb-8 opacity-0 animate-[fadeIn_0.5s_ease_forwards]">
      <div className="rounded-2xl border border-blue-500/20 bg-slate-900/60 p-4 text-center sm:p-5">
        <h2 className="text-xl font-bold text-blue-100 sm:text-2xl">{report.title}</h2>
        <p className="mt-1 text-xs text-slate-500">生成时间：{new Date(report.generatedAt).toLocaleString('zh-CN')}</p>
        {report.imageAnalysisSummary && report.imageAnalysisSummary !== '暂无数据' && (
          <p className="mt-3 rounded-lg bg-blue-500/10 px-3 py-2 text-left text-sm leading-relaxed text-slate-300">
            <span className="font-medium text-cyan-300">试卷图片分析：</span>
            {report.imageAnalysisSummary}
          </p>
        )}
      </div>
      <ScoreOverviewCard overview={report.scoreOverview} />

      {/* 进步趋势图 */}
      {diagnosisHistory && diagnosisHistory.length >= 2 && (
        <ProgressTrendChart history={diagnosisHistory} />
      )}

      {/* 班级/年级对比 */}
      {classComparison && (
        <ClassComparisonCard data={classComparison} />
      )}

      <LossAnalysisCard items={report.lossAnalysis} />
      <WeakPointsCard points={report.weakPoints} expanded={expandedPoint} onToggle={(id) => setExpandedPoint(expandedPoint === id ? null : id)} />
      <WrongQuestionsCard questions={report.wrongQuestions} />
      <ImprovementPlanCard plan={report.improvementPlan} planTasks={planTasks} onToggleTask={onToggleTask} />
      <RecommendedExercisesCard exercises={report.recommendedExercises} onExportPdf={onExportPdf} exporting={exporting} />
      <div className="flex flex-col gap-3 sm:flex-row">
        <button type="button" onClick={onShare} className="flex-1 rounded-xl border border-slate-600 py-2.5 text-sm text-slate-300 hover:border-blue-500/50">分享给老师</button>
        <button type="button" onClick={onBackHome} className="flex-1 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 py-2.5 text-sm text-white">返回首页</button>
      </div>
    </div>
  )
}
