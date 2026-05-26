# -*- coding: utf-8 -*-
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent / 'src/components/diagnosis'

ImprovementPlanCard = r'''import type { PlanDay } from '../../types/diagnosis'

interface Props {
  plan: PlanDay[]
  planTasks: Record<string, boolean>
  onToggleTask: (taskId: string) => void
}

export default function ImprovementPlanCard({ plan, planTasks, onToggleTask }: Props) {
  return (
    <motionFallback />
  )
}
'''

# Fix: write proper content without placeholder
ImprovementPlanCard = '''import type { PlanDay } from '../../types/diagnosis'

interface Props {
  plan: PlanDay[]
  planTasks: Record<string, boolean>
  onToggleTask: (taskId: string) => void
}

export default function ImprovementPlanCard({ plan, planTasks, onToggleTask }: Props) {
  return (
    <div className="rounded-2xl border border-blue-500/20 bg-slate-900/60 p-5 sm:p-6">
      <h3 className="mb-4 text-base font-semibold text-blue-200">个性化提升计划（未来两周）</h3>
      <div className="relative space-y-6 border-l-2 border-blue-500/30 pl-6">
        {plan.map((day) => (
          <div key={day.day} className="relative">
            <span className="absolute -left-[1.6rem] top-1 h-3 w-3 rounded-full bg-cyan-400" />
            <p className="text-sm font-semibold text-cyan-300">{day.day}</p>
            <ul className="mt-2 space-y-2">
              {day.tasks.map((task) => (
                <li key={task.id} className="flex items-start gap-2 text-sm text-slate-300">
                  <input
                    type="checkbox"
                    checked={!!planTasks[task.id]}
                    onChange={() => onToggleTask(task.id)}
                    className="mt-1 h-4 w-4 rounded border-slate-600 bg-slate-800 text-blue-500"
                  />
                  <span className={planTasks[task.id] ? 'line-through opacity-60' : ''}>{task.text}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </motionFallback>
  )
}
'''.replace('</motionFallback>', '</div>').replace('<motionFallback />', '')

RecommendedExercisesCard = '''import type { RecommendedExercise } from '../../types/diagnosis'

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
            <motionFallback />
          </motionFallback>
        ))}
      </div>
      <button type="button" onClick={onExportPdf} disabled={exporting} className="mt-4 w-full rounded-xl border border-blue-500/40 bg-blue-500/10 py-2.5 text-sm text-blue-200 hover:bg-blue-500/20 disabled:opacity-60">
        {exporting ? '导出中...' : '导出诊断报告 PDF'}
      </button>
    </motionFallback>
  )
}
'''

RecommendedExercisesCard = RecommendedExercisesCard.replace(
  '<motionFallback />',
  '''<motionFallback />'''
)

# manual fix for exercise item inner content
RecommendedExercisesCard = '''import type { RecommendedExercise } from '../../types/diagnosis'

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
'''

DiagnosisReportView = '''import { useState } from 'react'
import type { DiagnosisReport } from '../../types/diagnosis'
import ScoreOverviewCard from './ScoreOverviewCard'
import LossAnalysisCard from './LossAnalysisCard'
import WeakPointsCard from './WeakPointsCard'
import WrongQuestionsCard from './WrongQuestionsCard'
import ImprovementPlanCard from './ImprovementPlanCard'
import RecommendedExercisesCard from './RecommendedExercisesCard'

interface Props {
  report: DiagnosisReport
  reportRef: React.RefObject<HTMLDivElement | null>
  onExportPdf: () => void
  onShare: () => void
  onBackHome: () => void
  exporting: boolean
  planTasks: Record<string, boolean>
  onToggleTask: (taskId: string) => void
}

export default function DiagnosisReportView({
  report, reportRef, onExportPdf, onShare, onBackHome, exporting, planTasks, onToggleTask,
}: Props) {
  const [expandedPoint, setExpandedPoint] = useState<string | null>(null)

  return (
    <div ref={reportRef} className="mx-auto max-w-3xl space-y-5 pb-8 opacity-0 animate-[fadeIn_0.5s_ease_forwards]">
      <div className="rounded-2xl border border-blue-500/20 bg-slate-900/60 p-4 text-center sm:p-5">
        <h2 className="text-xl font-bold text-blue-100 sm:text-2xl">{report.title}</h2>
        <p className="mt-1 text-xs text-slate-500">生成时间：{new Date(report.generatedAt).toLocaleString('zh-CN')}</p>
      </div>
      <ScoreOverviewCard overview={report.scoreOverview} />
      <LossAnalysisCard items={report.lossAnalysis} />
      <WeakPointsCard points={report.weakPoints} expanded={expandedPoint} onToggle={(id) => setExpandedPoint(expandedPoint === id ? null : id)} />
      <WrongQuestionsCard questions={report.wrongQuestions} />
      <ImprovementPlanCard plan={report.improvementPlan} planTasks={planTasks} onToggleTask={onToggleTask} />
      <RecommendedExercisesCard exercises={report.recommendedExercises} onExportPdf={onExportPdf} exporting={exporting} />
      <motionFallback />
    </div>
  )
}
'''.replace('<motionFallback />', '''<div className="flex flex-col gap-3 sm:flex-row">
        <button type="button" onClick={onShare} className="flex-1 rounded-xl border border-slate-600 py-2.5 text-sm text-slate-300 hover:border-blue-500/50">分享给老师</button>
        <button type="button" onClick={onBackHome} className="flex-1 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 py-2.5 text-sm text-white">返回首页</button>
      </div>''')

for name, content in [
  ('ImprovementPlanCard.tsx', ImprovementPlanCard),
  ('RecommendedExercisesCard.tsx', RecommendedExercisesCard),
  ('DiagnosisReportView.tsx', DiagnosisReportView),
]:
  (BASE / name).write_text(content, encoding='utf-8')
  print('wrote', name)
