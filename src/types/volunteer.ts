/** 志愿填报 — 类型定义（对齐 rules-spec 附录 A） */

export type VolunteerTierLabel = '冲' | '稳' | '保'
export type GradientLevel = '极冲' | '冲' | '较冲' | '稳' | '较保' | '保'
export type SchemeStatus = 'draft' | 'saved' | 'archived'
export type ZhejiangBatchSegment = '一段' | '二段'
export type ComplianceLevel = 'error' | 'warning'

export interface ComplianceIssue {
  code: string
  level: ComplianceLevel
  message: string
}

export interface ZhejiangRulesSummary {
  mode: string
  elective: string
  batchNote: string
  rankFirst: string
  subjectMatch: string
}

export interface ZhejiangRulesSection {
  title: string
  content: string
}

export interface ScoreRankConvertResult {
  success: boolean
  message?: string
  dataSource?: string
  score?: number
  rank?: number
  examYear?: number
  subjectType?: string
  sectionNum?: number
  rankPercent?: number
  totalStudent?: number
  batch?: string
  category?: string
  reference?: Record<string, number>
  historicalSameRankScores?: HistoricalSameRankScore[]
}

export interface HistoricalSameRankScore {
  examYear: number
  score?: number
  rank?: number
  sectionNum?: number
  rankPercent?: number
  totalStudent?: number
}

export interface ScoreDistributionSegment {
  score: number
  rank: number
  sectionNum?: number
  rankPercent?: number
}

export interface ScoreDistributionResponse {
  success: boolean
  message?: string
  dataSource?: string
  examYear?: number
  startScore?: number
  endScore?: number
  rankRange?: { min: number; max: number }
  totalStudents?: number
  segmentCount?: number
  density?: ScoreDistributionSegment[]
}

export interface BenchmarkCollegeItem {
  tierLabel: VolunteerTierLabel
  gapLabel?: '冲' | '稳' | '保'
  rankGap?: number | null
  collegeName: string
  majorName: string
  collegeCode?: string
  majorCode?: string
  subjectRequirement?: string
  predictedRank?: number
  minRank?: number
  minScore?: number
  avgScore?: number
  probability?: number
  enrollmentPlan?: number | null
  historicalAdmission?: HistoricalAdmissionRow[]
}

export interface BenchmarkResponse {
  success: boolean
  message?: string
  userRank?: number
  examYear?: number
  dataSource?: string
  tiers?: {
    冲: BenchmarkCollegeItem[]
    稳: BenchmarkCollegeItem[]
    保: BenchmarkCollegeItem[]
  }
  summary?: { total: number; rush: number; stable: number; safe: number }
}

export interface SameRankCollegeItem {
  collegeName: string
  majorName: string
  collegeCode?: string
  majorCode?: string
  minRank?: number
  minScore?: number
  subjectRequirement?: string
  rankDelta?: number
  batchSegment?: string
}

export interface HistoricalAdmissionRow {
  year: number
  minRank: number
  avgRank?: number | null
  minScore?: number | null
  avgScore?: number | null
  enrollmentCount?: number | null
}

export interface TierStrategyEntry {
  count: number
  guide: string
  avgProbability: number | null
}

export interface TierStrategySummary {
  冲: TierStrategyEntry
  稳: TierStrategyEntry
  保: TierStrategyEntry
}

export interface VolunteerFormInput {
  province: string
  subjectType: string
  subjects: string[]
  score?: number
  rank: number
  intendedMajors: string[]
  batchType: string
  /** 浙江专属：高考年份 */
  examYear?: number
  /** 浙江专属：一段 / 二段 */
  batchSegment?: ZhejiangBatchSegment
  schemeName?: string
}

export interface VolunteerItem {
  itemId?: string
  sortOrder: number
  tierLabel: VolunteerTierLabel
  gradientLevel?: GradientLevel
  collegeName: string
  majorName: string
  admissionDataId?: string
  predictedRank?: number
  predictedMinRank?: number
  probability?: number
  rankRatio?: number
  minScore?: number
  avgScore?: number
  minRank?: number
  subjectRequirement?: string
  isManual?: boolean
  extJson?: Record<string, unknown>
  majorIntro?: string
  employment?: string
  curriculum?: string[]
  careerPaths?: string[]
  tierExplanation?: string
  gradientGuide?: string
  historicalAdmission?: HistoricalAdmissionRow[]
}

export interface VolunteerScheme {
  schemeId: string
  userId: string
  schemeName?: string
  province: string
  subjectType: string
  subjects?: string[]
  score?: number
  rank: number
  intendedMajors?: string[]
  batchType?: string
  examYear?: number
  batchSegment?: ZhejiangBatchSegment
  inputExt?: Record<string, unknown>
  status: SchemeStatus
  createdAt?: string
  updatedAt?: string
}

export interface VolunteerSchemeSummary {
  schemeId: string
  userId: string
  schemeName?: string
  province: string
  subjectType: string
  rank: number
  status: SchemeStatus
  itemCount?: number
  createdAt?: string
  updatedAt?: string
}

export interface GenerateVolunteerResponse {
  success: boolean
  message?: string
  scheme?: VolunteerScheme
  items?: VolunteerItem[]
  tierStrategy?: TierStrategySummary
  summary?: { total: number; rush: number; stable: number; safe: number }
  compliance?: {
    warnings?: ComplianceIssue[]
    batchSegment?: ZhejiangBatchSegment
    examYear?: number
  }
}

export interface ZhejiangValidateResponse {
  success: boolean
  valid?: boolean
  zhejiang?: boolean
  issues?: ComplianceIssue[]
  errors?: ComplianceIssue[]
  warnings?: ComplianceIssue[]
  message?: string
}

export interface ZhejiangRulesResponse {
  success: boolean
  summary?: ZhejiangRulesSummary
  sections?: ZhejiangRulesSection[]
  message?: string
}

export interface SameRankResponse {
  success: boolean
  message?: string
  items?: SameRankCollegeItem[]
  total?: number
  rank?: number
  window?: { minRank: number; maxRank: number }
}

export interface SchemesListResponse {
  success: boolean
  message?: string
  schemes?: VolunteerSchemeSummary[]
}

export interface SchemeDetailResponse {
  success: boolean
  message?: string
  scheme?: VolunteerScheme
  items?: VolunteerItem[]
}
