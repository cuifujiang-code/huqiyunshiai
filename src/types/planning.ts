export const PLANNING_GRADES = [
  '初一',
  '初二',
  '初三',
  '高一',
  '高二',
  '高三',
] as const

export type PlanningGrade = (typeof PLANNING_GRADES)[number]

export const GOAL_DIRECTIONS = [
  '中考',
  '高考',
  '学科竞赛',
  '强基计划',
  '综合评价',
  '出国留学',
] as const

export type GoalDirection = (typeof GOAL_DIRECTIONS)[number]

export const SCORE_LEVELS = ['优秀', '良好', '中等', '待提升'] as const

export type ScoreLevel = (typeof SCORE_LEVELS)[number]

export const INTEREST_TAGS = [
  '数学',
  '物理',
  '化学',
  '生物',
  '语文',
  '英语',
  '历史',
  '地理',
  '政治',
  '编程',
  '文学',
  '艺术',
  '体育',
  '音乐',
] as const

export type InterestTag = (typeof INTEREST_TAGS)[number]

export interface PlanningFormData {
  studentName: string
  grade: PlanningGrade
  goalDirections: GoalDirection[]
  scoreLevel: ScoreLevel
  interests: InterestTag[]
  parentExpectations: string
  specialNotes: string
  createdByRole?: 'teacher' | 'student'
}

export interface AbilityDimension {
  label: string
  score: number
}

export interface StageGoal {
  period: string
  phase: string
  coreTasks: string[]
  expectedOutcomes: string[]
}

export interface SubjectPath {
  subject: string
  importance: number
  timePercent: number
  keyKnowledgePoints: string[]
  resourceTypes: string[]
}

export interface PhaseTaskItem {
  name: string
  criteria: string
  duration: string
  knowledgePoints: string[]
  relatedExercises: string[]
}

export interface PhaseTaskGroup {
  phase: string
  tasks: PhaseTaskItem[]
}

export interface PlanningMilestone {
  date: string
  event: string
  preparationAdvice: string
}

export interface PlanningRisk {
  risk: string
  impact: string
  mitigation: string
}

export interface PlanningReport {
  title: string
  generatedAt: string
  studentProfile: {
    name: string
    grade: string
    scoreLevel: string
    goalDirections: string[]
    interests: string[]
    parentExpectations: string
    specialNotes: string
  }
  abilityDimensions: AbilityDimension[]
  stageGoals: StageGoal[]
  subjectPaths: SubjectPath[]
  phaseTasks: PhaseTaskGroup[]
  milestones: PlanningMilestone[]
  risks: PlanningRisk[]
  source?: 'ai' | 'mock'
}

export interface PlanningResponse {
  success: boolean
  message?: string
  report?: PlanningReport
  isMockFallback?: boolean
  /** 调试：client-mock | server-mock | server-ai */
  debugSource?: string
  errorDetail?: unknown
  deepseekConfig?: { hasApiKey: boolean; apiBase: string; model: string; url: string }
}

export interface SavedPlanningRecord {
  id: string
  studentName: string
  studentUserId?: string
  createdBy: 'teacher' | 'student'
  creatorUserId?: string
  form: PlanningFormData
  report: PlanningReport
  createdAt: string
}
