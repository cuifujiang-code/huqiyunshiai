/** 志愿填报 — 类型定义（对齐 rules-spec 附录 A） */

export type VolunteerTierLabel = '冲' | '稳' | '保'
export type GradientLevel = '极冲' | '冲' | '较冲' | '稳' | '较保' | '保'
export type SchemeStatus = 'draft' | 'saved' | 'archived'

export interface VolunteerFormInput {
  province: string
  subjectType: string
  subjects: string[]
  score?: number
  rank: number
  intendedMajors: string[]
  batchType: string
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
  createdAt?: string
  updatedAt?: string
}

export interface GenerateVolunteerResponse {
  success: boolean
  message?: string
  scheme?: VolunteerScheme
  items?: VolunteerItem[]
  summary?: { total: number; rush: number; stable: number; safe: number }
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
