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
    /** 当前学期 */
    academicTerm?: string
    /** 省份考试制度摘要 */
    examSystemNote?: string
    /** 选考科目 */
    electiveSubjects?: string[]
  }
  abilityDimensions: AbilityDimension[]
  stageGoals: StageGoal[]
  subjectPaths: SubjectPath[]
  phaseTasks: PhaseTaskGroup[]
  milestones: PlanningMilestone[]
  risks: PlanningRisk[]
  /** 数据驱动五阶段规划（planningEngine） */
  fiveStagePlan?: FiveStagePlanItem[]
  dataSourceCitations?: string[]
  dataProvenance?: { engine: string; version?: string; citations: string[] }
  targetUniversity?: string
  targetMajor?: string
  scoreGapAnalysis?: {
    currentEstimate?: number
    targetMinScore?: number
    gap?: number
    gapBand?: string
  }
  dynamicCalibrationNotes?: string
  /** 量化成绩波动分析 */
  scoreAnalysis?: ScoreAnalysisResult
  /** 省份考试与志愿时间轴 */
  examTimeline?: { month: string; event: string; note?: string }[]
  /** 志愿填报策略 */
  volunteerGuidance?: string[]
  /** 选考科目专项建议 */
  electiveAdvice?: { subject: string; level?: string; advice: string }[]
  /** 多 AI 协同元数据 */
  orchestrationMeta?: PlanningOrchestrationMeta
  source?: 'ai' | 'mock' | 'ai-data-driven'
}

export interface FiveStagePlanItem {
  stage: number
  name: string
  period: string
  durationWeeks?: number
  objectives: string[]
  coreTasks: string[]
  deliverables?: string[]
  calibrationCheckpoint?: string
}

export interface UniversityLookupResult {
  matched: boolean
  university?: string
  aliases?: string[]
  tier?: string
  province?: string
  major?: string
  year?: number
  admission?: {
    min_score?: number
    min_rank?: number
    elective_requirement?: string
    notes?: string
  }
  source?: string
  citation?: string
  message?: string
  emptyDataRule?: { message?: string; forbid_ai_hallucination?: boolean }
}

export interface PlanningOrchestrationMeta {
  providersUsed: string[]
  reviewRequired: boolean
  scoreAnalystSummary?: string
  provincialExpertSummary?: string
  reviewerNotes?: string[]
  finalNotes?: string
}

export interface ExamScoreRecord {
  id: string
  examName: string
  examDate: string
  academicYear: string
  term: '上学期' | '下学期'
  examType: string
  subjectScores: SubjectScore[]
  totalScore: number | null
  schoolRank: number | null
  classRank: number | null
}

export interface ScoreAnalysisSubjectInsight {
  subject: string
  isElective: boolean
  latestScore: number
  firstScore: number
  delta: number
  avgScore: number
  volatility: number
  ratePercent: number
  trend: 'up' | 'stable' | 'down'
  examCount: number
}

export interface ScoreAnalysisResult {
  recordCount: number
  overallTrend: 'up' | 'stable' | 'down'
  overallDelta: number
  volatilityIndex: number
  subjectInsights: ScoreAnalysisSubjectInsight[]
  weakSubjects: string[]
  strongSubjects: string[]
  rankTrend: { from: number; to: number; improved: boolean } | null
  summary: string
}

export interface PlanningResponse {
  success: boolean
  message?: string
  report?: PlanningReport
  isMockFallback?: boolean
  orchestrationMeta?: PlanningOrchestrationMeta
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

/** 规划任务进度 — 存储在 Supabase */
export interface PlanningTaskProgress {
  planId: string
  phaseIndex: number
  taskIndex: number
  taskName: string
  completed: boolean
  completedAt?: string
  notes?: string
  updatedAt: string
}

/** 教师端查看学生规划执行概要 */
export interface StudentPlanSummary {
  studentId: string
  studentName: string
  planTitle: string
  totalTasks: number
  completedTasks: number
  progressPercent: number
  lastActivityAt: string
}

/** 甘特图任务项 */
export interface GanttTask {
  id: string
  name: string
  phase: string
  startDate: string
  endDate: string
  completed: boolean
  color: string
}

// ============================================================
// 教育规划系统 — 新增类型（2026-06-03）
// ============================================================

/** 升学路线枚举 */
export const PLAN_ROUTES = [
  { code: 'zhongkao', name: '常规中考路线', desc: '适用五年级下学期至初三' },
  { code: 'gaokao', name: '浙江新高考3+3路线', desc: '适用高一至高三，7选3选科制' },
  { code: 'qiangji', name: '强基计划路线', desc: '数理导向，适配985数学单科140+破格政策' },
  { code: 'jingsai', name: '五大学科竞赛', desc: '数/物/化/生/信奥竞赛体系' },
  { code: 'yishu', name: '艺术特长路线', desc: '美术/声乐通用，艺考统考方向' },
  { code: 'keji', name: '科技特长路线', desc: '科创/青少年创新大赛方向' },
  { code: 'gongfei', name: '公费&定向师范生路线', desc: '公费师范生/定向师范生方向' },
] as const

export type PlanRouteCode = (typeof PLAN_ROUTES)[number]['code']

/** 路线配置 */
export interface PlanRoute {
  route_id: string
  route_name: string
  route_code: PlanRouteCode
  route_desc: string
  sort: number
  is_active: boolean
  ext_json?: Record<string, unknown>
}

/** 阶段配置 */
export interface PlanStage {
  stage_id: string
  route_id: string
  stage_name: string
  stage_order: number
  stage_desc?: string
  sort: number
  tasks?: TaskTemplate[]
}

/** 任务模板 */
export interface TaskTemplate {
  task_temp_id: string
  stage_id: string
  task_name: string
  content?: string
  suggest_total_hours?: number
  suggest_daily_minutes?: number
  suggest_weekly_hours?: number
  relate_knowledge?: string[]
  complete_standard?: string
  is_parallel: boolean
  pre_task_id?: string
  sort: number
  ext_json?: Record<string, unknown>
}

/** 完整路线（含阶段和任务） */
export interface RouteDetail extends PlanRoute {
  stages: PlanStage[]
}

/** 学生规划 */
export interface StudentPlan {
  plan_id: string
  student_user_id: string
  student_name?: string
  route_id: string
  plan_title: string
  plan_start_date: string
  plan_end_date?: string
  creator_user_id?: string
  created_by: 'teacher' | 'student' | 'parent'
  plan_data?: Record<string, unknown>
  tasks?: UserTaskRecord[]
  stats?: PlanStats
  created_at: string
  updated_at: string
}

/** 规划统计 */
export interface PlanStats {
  totalTasks: number
  completedTasks: number
  delayedTasks: number
  progressPercent: number
}

/** 用户任务记录 */
export interface UserTaskRecord {
  task_id: string
  plan_id: string
  temp_id?: string
  task_name: string
  route_type?: PlanRouteCode
  stage_name?: string
  start_date: string
  end_date: string
  task_days: number
  is_parallel: boolean
  pre_task_id?: string
  complete_rate: number
  status: 'unfinish' | 'doing' | 'finish' | 'delay'
  notes?: string
  ext_json?: Record<string, unknown>
}

/** 甘特图数据（新格式，兼容ECharts） */
export interface GanttData {
  planId: string
  planName: string
  planStartDate: string
  planEndDate?: string
  taskList: GanttTaskItem[]
}

export interface GanttTaskItem {
  taskId: string
  taskName: string
  routeType: string
  stageName: string
  startDate: string
  endDate: string
  taskDays: number
  isParallel: boolean
  preTaskId: string
  completeRate: number
  status: 'unfinish' | 'doing' | 'finish' | 'delay'
  extJson: string
}

/** 周报 */
export interface WeeklyReport {
  totalTasks: number
  completedTasks: number
  unfinishedTasks: number
  delayedTasks: number
  completionRate: number
  subjectBreakdown: SubjectBreakdown[]
  timeComparison: { actual: number; planned: number }
  warnings: WarningItem[]
  unfinishedList: UnfinishedItem[]
  weekRange: { start: string; end: string }
  studentId?: string
  studentName?: string
  planId?: string
  planTitle?: string
}

export interface SubjectBreakdown {
  name: string
  total: number
  completed: number
  rate: number
}

export interface WarningItem {
  subject: string
  rate: number
  message: string
}

export interface UnfinishedItem {
  taskId: string
  taskName: string
  status: string
  stageName: string
}

/** 月报 */
export interface MonthlyReport {
  totalTasks: number
  completedTasks: number
  completionRate: number
  stageProgress: { stageName: string; total: number; completed: number; rate: number }[]
  knowledgeCoverage: number
  standardMet: number
  standardTotal: number
  suggestions: string[]
  month: string
  studentId?: string
  studentName?: string
  planId?: string
  planTitle?: string
  /** 月度进步趋势（各周完成率） */
  weeklyTrend?: { weekLabel: string; completed: number; total: number; rate: number }[]
  weeklySummary?: WeeklyReport
}

/** 教师端全班概览 */
export interface TeacherOverview {
  students: TeacherStudentItem[]
  classAvgRate: number
  weakStudents: { studentName: string; progressPercent: number; planTitle: string }[]
}

export interface TeacherStudentItem {
  planId: string
  studentId: string
  studentName: string
  planTitle: string
  routeName: string
  totalTasks: number
  completedTasks: number
  progressPercent: number
  lastActivity: string
}

/** 家长绑定 */
export interface ParentBinding {
  id: string
  student_user_id: string
  parent_user_id: string
  bind_type: 'invite_code' | 'phone' | 'batch'
  invite_code?: string
  status: 'active' | 'pending' | 'unbound'
  bound_at?: string
  unbound_at?: string
}

/** 邀请码 */
export interface InviteCode {
  code: string
  expires_at: string
}

// ============================================================
// 学生详细信息（教育规划增强版）
// ============================================================

export interface StudentSchoolInfo {
  province: string      // 省份
  city: string          // 地级市
  district: string      // 区/县
  schoolName: string    // 学校名称
  grade: string         // 年级
  className: string     // 班级
}

export interface StudentRanking {
  classRank: number | null      // 班级排名
  classTotal: number | null     // 班级总人数
  schoolRank: number | null     // 校级排名
  schoolTotal: number | null    // 年级总人数
}

export interface SubjectScore {
  subject: string          // 学科名称
  score: number | null     // 最近一次考试分数
  fullScore: number        // 满分
  classRank: number | null // 该科目班级排名
  schoolRank: number | null // 该科目校级排名
  scoreTrend: 'up' | 'stable' | 'down' // 分数趋势
}

export interface StudentSpecialty {
  type: 'art' | 'music' | 'sports' | 'technology' | 'literature' | 'other'
  name: string          // 特长名称，如"钢琴十级"
  level: string         // 等级，如"十级"/"省级一等奖"
  yearsOfExperience: number  // 学习年限
  description: string   // 详细描述
}

/** 一分一段：score 为分数，cumulativeRank 为累计位次（含同分） */
export interface ScoreSegment {
  score: number
  cumulativeRank: number
  sameScoreCount?: number
}

export interface ExamDataReference {
  province: string
  city: string
  year: number
  examType: '中考' | '高考'
  subjects: {
    subject: string
    avgScore: number
    topScore: number
    cutoffLines: { tier: string; score: number }[]
    scoreSegments?: ScoreSegment[]
  }[]
  keySchools: { name: string; minScore: number; ranking: number }[]
  updatedAt: string
  source: string
}

// 教育规划完整表单（增强版）
export interface EnhancedPlanningFormData {
  // 基本信息
  studentName: string
  gender: '男' | '女' | ''
  birthDate: string
  
  // 学校信息
  schoolInfo: StudentSchoolInfo
  
  // 排名信息
  ranking: StudentRanking
  
  // 目标
  goalDirections: GoalDirection[]
  targetSchools: string[]    // 目标学校名称列表
  scoreLevel: ScoreLevel
  
  // 各科成绩
  subjectScores: SubjectScore[]
  
  // 兴趣特长
  interests: InterestTag[]
  specialties: StudentSpecialty[]
  
  // 家长期望
  parentExpectations: string
  specialNotes: string
  
  // 考试数据（AI获取）
  examDataRef?: ExamDataReference

  /** 当前规划所依据学期 */
  academicTerm: '上学期' | '下学期'
  /** 选考科目（如浙江7选3） */
  electiveSubjects: string[]
  /** 历次考试成绩 */
  scoreHistory: ExamScoreRecord[]
  /** 客户端预计算的成绩分析 */
  scoreAnalysis?: ScoreAnalysisResult

  createdByRole?: 'teacher' | 'student'
}
