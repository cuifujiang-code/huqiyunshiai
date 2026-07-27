import { postApiJson } from './postApiJson'

export type SubjectAnalysisScores = Record<string, number | null>

export interface SubjectRecommendation {
  combo: string
  subjects: string[]
  majorCount: number
  coverageRate: number
  scoreAvg: number
  subjectType: string
}

export interface SubjectAnalysisResult {
  success: boolean
  recommendations: SubjectRecommendation[]
  advice: string
  message?: string
}

export interface ActionChecklistWeek {
  week: number
  focus: string
  tasks: string[]
  milestone: string
}

export interface PracticeTip {
  subject: string
  knowledgePoint: string
  difficulty: string
}

export interface ActionChecklistResult {
  success: boolean
  grade: string
  goal: string
  weakSubject: string
  weeks: ActionChecklistWeek[]
  practiceTips: PracticeTip[]
  message?: string
}

export async function fetchSubjectAnalysis(
  scores: SubjectAnalysisScores,
): Promise<SubjectAnalysisResult> {
  const result = await postApiJson<SubjectAnalysisResult>(
    '/api/planning/toolkit/subject-analysis',
    { scores },
    '选科分析',
    { timeoutMs: 120000 },
  )
  if (result.kind === 'fallback') {
    throw new Error(result.reason || '选科分析服务不可用')
  }
  if (!result.data.success) {
    throw new Error(result.data.message || '选科分析失败')
  }
  return result.data
}

export async function fetchActionChecklist(params: {
  grade: string
  goal: string
  weakSubject: string
  teacherId?: string
}): Promise<ActionChecklistResult> {
  const result = await postApiJson<ActionChecklistResult>(
    '/api/planning/toolkit/action-checklist',
    params,
    '行动清单',
    { timeoutMs: 180000 },
  )
  if (result.kind === 'fallback') {
    throw new Error(result.reason || '行动清单服务不可用')
  }
  if (!result.data.success) {
    throw new Error(result.data.message || '行动清单生成失败')
  }
  return result.data
}
