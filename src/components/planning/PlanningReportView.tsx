import type { RefObject } from 'react'
import type { PlanningReport, GanttTask, PlanningTaskProgress } from '../../types/planning'
import MilestoneRemindersCard from './MilestoneRemindersCard'
import RiskMitigationCard from './RiskMitigationCard'
import StageGoalsTimeline from './StageGoalsTimeline'
import StudentProfileCard from './StudentProfileCard'
import SubjectPathTable from './SubjectPathTable'
import TaskListCard from './TaskListCard'
import GanttChart from './GanttChart'
import ProgressChecklist from './ProgressChecklist'

interface Props {
  report: PlanningReport
  reportRef?: RefObject<HTMLDivElement | null>
  /** 甘特图数据 */
  ganttTasks?: GanttTask[]
  /** 任务进度（前端本地状态） */
  checklistProgress?: Record<string, boolean>
  onChecklistToggle?: (phaseIndex: number, taskIndex: number) => void
  /** Supabase 进度数据 */
  supabaseProgress?: PlanningTaskProgress[]
  /** 是否只读（教师端查看） */
  readOnly?: boolean
  /** 甘特图勾选回调 */
  onGanttToggle?: (taskId: string) => void
}

export default function PlanningReportView({
  report, reportRef, ganttTasks, checklistProgress, onChecklistToggle,
  supabaseProgress, readOnly, onGanttToggle,
}: Props) {
  return (
    <div ref={reportRef} id="planning-report-content" className="space-y-5 pb-4">
      <StudentProfileCard report={report} />
      <StageGoalsTimeline stageGoals={report.stageGoals} />

      {/* 甘特图 */}
      {ganttTasks && ganttTasks.length > 0 && (
        <GanttChart tasks={ganttTasks} onToggle={onGanttToggle} readOnly={readOnly} />
      )}

      {/* 阶段任务清单（可勾选） */}
      {report.phaseTasks.length > 0 && (
        <ProgressChecklist
          phaseTasks={report.phaseTasks}
          progress={checklistProgress}
          onToggle={onChecklistToggle}
          readOnly={readOnly}
          supabaseProgress={supabaseProgress}
        />
      )}

      <SubjectPathTable subjectPaths={report.subjectPaths} />
      <TaskListCard phaseTasks={report.phaseTasks} />
      <MilestoneRemindersCard milestones={report.milestones} />
      <RiskMitigationCard risks={report.risks} />
    </div>
  )
}
