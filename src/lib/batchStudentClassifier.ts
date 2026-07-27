import type { ExamDifficulty, WizardSubjectScore } from '../types/planning'
import { calcCompetencyScore } from './planningWizardUtils'

export const BATCH_MAIN_SUBJECTS = ['语文', '数学', '英语'] as const
export const BATCH_ELECTIVE_SUBJECTS = ['物理', '化学', '生物', '历史', '地理', '政治'] as const

export type BatchRouteCategory = '冲刺路线' | '优秀路线' | '稳健路线' | '需要关注'

export interface BatchStudentRow {
  name: string
  competencyScore: number
  category: BatchRouteCategory
  scores: Record<string, number>
}

export interface BatchAnalysisSummary {
  冲刺路线: number
  优秀路线: number
  稳健路线: number
  需要关注: number
}

const ROUTE_BY_SCORE = [
  { min: 85, category: '冲刺路线' as const },
  { min: 70, category: '优秀路线' as const },
  { min: 55, category: '稳健路线' as const },
  { min: 0, category: '需要关注' as const },
]

export function classifyCompetencyScore(score: number): BatchRouteCategory {
  for (const row of ROUTE_BY_SCORE) {
    if (score >= row.min) return row.category
  }
  return '需要关注'
}

export const ROUTE_COLORS: Record<BatchRouteCategory, string> = {
  冲刺路线: 'bg-green-500/20 text-green-400 border-green-500/30',
  优秀路线: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  稳健路线: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  需要关注: 'bg-red-500/20 text-red-400 border-red-500/30',
}

export const ROUTE_CHART_COLORS: Record<BatchRouteCategory, string> = {
  冲刺路线: '#22C55E',
  优秀路线: '#3B82F6',
  稳健路线: '#F59E0B',
  需要关注: '#EF4444',
}

function normalizeHeader(h: unknown): string {
  return String(h ?? '')
    .trim()
    .replace(/\s+/g, '')
}

function parseScore(val: unknown): number | null {
  if (val == null || val === '') return null
  const n = Number(val)
  return Number.isFinite(n) ? n : null
}

function buildSubjectScores(
  subjects: readonly string[],
  row: Record<string, unknown>,
  fullScore: number,
): WizardSubjectScore[] {
  return subjects
    .map((subject) => {
      const score = parseScore(row[subject])
      if (score == null) return null
      const capped = Math.min(fullScore, Math.max(0, score))
      return {
        subject,
        score: capped,
        difficulty: '校内月考' as ExamDifficulty,
      }
    })
    .filter((s): s is WizardSubjectScore => s != null)
}

export function analyzeBatchRows(rawRows: Record<string, unknown>[]): BatchStudentRow[] {
  return rawRows
    .map((row) => {
      const name = String(row['姓名'] ?? row['name'] ?? row['学生姓名'] ?? '').trim()
      if (!name) return null

      const mainScores = buildSubjectScores(BATCH_MAIN_SUBJECTS, row, 150)
      const electiveScores = buildSubjectScores(BATCH_ELECTIVE_SUBJECTS, row, 100)
      const competencyScore = calcCompetencyScore(mainScores, electiveScores)

      const scores: Record<string, number> = {}
      ;[...BATCH_MAIN_SUBJECTS, ...BATCH_ELECTIVE_SUBJECTS].forEach((s) => {
        const v = parseScore(row[s])
        if (v != null) scores[s] = v
      })

      return {
        name,
        competencyScore,
        category: classifyCompetencyScore(competencyScore),
        scores,
      }
    })
    .filter((r): r is BatchStudentRow => r != null)
}

export function summarizeBatchRows(rows: BatchStudentRow[]): BatchAnalysisSummary {
  const summary: BatchAnalysisSummary = {
    冲刺路线: 0,
    优秀路线: 0,
    稳健路线: 0,
    需要关注: 0,
  }
  rows.forEach((r) => {
    summary[r.category] += 1
  })
  return summary
}

export function validateBatchHeaders(headers: string[]): string | null {
  const normalized = headers.map(normalizeHeader)
  const required = ['姓名', '语文', '数学', '英语']
  const nameOk = normalized.some((h) => ['姓名', '学生姓名', 'name'].includes(h))
  if (!nameOk) return '表头须包含「姓名」列'
  for (const col of ['语文', '数学', '英语']) {
    if (!normalized.includes(col)) return `表头须包含「${col}」列`
  }
  return null
}

export function mapRowKeys(row: Record<string, unknown>, headers: string[]): Record<string, unknown> {
  const mapped: Record<string, unknown> = {}
  headers.forEach((h, i) => {
    const key = normalizeHeader(h)
    const canonical =
      key === '学生姓名' || key === 'name' ? '姓名' : key
    mapped[canonical] = row[h] ?? row[String(i)] ?? row[headers[i]]
  })
  return mapped
}
