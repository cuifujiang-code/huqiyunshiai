export interface SubjectScoreInput {
  score: number
  avg: number
  max: number
}

export type LossReason =
  | '计算错误'
  | '概念不清'
  | '审题失误'
  | '时间不够'
  | '粗心大意'

export interface ExamReviewFormData {
  examName: string
  examDate: string
  scores: Record<string, SubjectScoreInput>
  lossReasons: LossReason[]
}

export interface SubjectAnalysis {
  subject: string
  score: number
  avg: number
  max: number
  deviationRate: number
  deviationPercent: number
  highPriority: boolean
}

export interface TrendItem {
  subject: string
  previousScore: number | null
  delta: number | null
}

export interface PracticeTip {
  subject: string
  knowledgePoint: string
}

export interface ExamReviewReport {
  recordId: string | null
  examName: string
  examDate: string
  analysis: SubjectAnalysis[]
  trend: TrendItem[] | null
  practiceTips: PracticeTip[]
  highPrioritySubjects: string[]
  diagnosis: string
  actionPlan: string
  previousExam: { examName: string; examDate: string } | null
}

export interface ExamReviewHistoryItem {
  id: string
  exam_name: string
  exam_date: string
  scores_json: Record<string, unknown>
  ai_report: string | null
  action_plan: string | null
  created_at: string
}
