/** 浙江高考志愿 — 前端常量 */
export const ZHEJIANG_BATCH_SEGMENTS = ['一段', '二段'] as const
export const ZHEJIANG_VOLUNTEER_LIMIT = 80
export const ZHEJIANG_ELECTIVE_COUNT = 3

export const EXAM_YEAR_OPTIONS = [2026, 2025, 2024, 2023] as const

export const DEFAULT_TIER_GUIDE = {
  冲: '录取概率偏低，可作为向上争取的志愿；建议占志愿表前 20%–30%，不宜过多。',
  稳: '录取概率与位次匹配度较高，是志愿表的主体，建议占 40%–50%。',
  保: '录取概率较高，用于兜底防滑档，建议占 20%–30%，确保至少能被录取。',
} as const

export const TIER_COLORS = {
  冲: 'border-rose-500/40 bg-rose-950/30',
  稳: 'border-amber-500/40 bg-amber-950/30',
  保: 'border-emerald-500/40 bg-emerald-950/30',
} as const

export const TIER_BADGE = {
  冲: 'bg-rose-600/80 text-rose-50',
  稳: 'bg-amber-600/80 text-amber-50',
  保: 'bg-emerald-600/80 text-emerald-50',
} as const

/** 解析选考要求并标记考生已选科目 */
export function parseSubjectRequirement(requirement?: string): {
  tokens: string[]
  raw: string
} {
  const raw = (requirement || '不限').trim()
  if (!raw || raw === '不限') return { tokens: [], raw: '不限' }
  const tokens = raw.split(/[、,，/\s]+/).filter(Boolean)
  return { tokens, raw }
}

export function rankCompareLabel(userRank: number, refRank?: number | null): {
  text: string
  tone: 'better' | 'worse' | 'match' | 'unknown'
} {
  if (refRank == null || refRank <= 0) return { text: '—', tone: 'unknown' }
  const delta = userRank - refRank
  if (Math.abs(delta) <= refRank * 0.03) return { text: '位次接近', tone: 'match' }
  if (delta < 0) return { text: `高于 ${Math.abs(delta).toLocaleString()} 名`, tone: 'better' }
  return { text: `低于 ${delta.toLocaleString()} 名`, tone: 'worse' }
}
