import type { RefObject } from 'react'
import type { PlanningReport } from '../../types/planning'
import MilestoneRemindersCard from './MilestoneRemindersCard'
import RiskMitigationCard from './RiskMitigationCard'
import StageGoalsTimeline from './StageGoalsTimeline'
import StudentProfileCard from './StudentProfileCard'
import SubjectPathTable from './SubjectPathTable'
import TaskListCard from './TaskListCard'

interface Props {
  report: PlanningReport
  reportRef?: RefObject<HTMLDivElement | null>
}

export default function PlanningReportView({ report, reportRef }: Props) {
  return (
    <div ref={reportRef} id="planning-report-content" className="space-y-5 pb-4">
      <StudentProfileCard report={report} />
      <StageGoalsTimeline stageGoals={report.stageGoals} />
      <SubjectPathTable subjectPaths={report.subjectPaths} />
      <TaskListCard phaseTasks={report.phaseTasks} />
      <MilestoneRemindersCard milestones={report.milestones} />
      <RiskMitigationCard risks={report.risks} />
    </div>
  )
}
