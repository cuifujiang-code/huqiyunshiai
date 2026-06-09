/**
 * 高考志愿填报核心算法引擎
 * 严格遵循 knowledge-base/volunteer-filling/rules-spec.md §2、§4
 */

const DEFAULT_WEIGHTS = [0.5, 0.3, 0.2]
const GRADIENT_LEVELS = ['极冲', '冲', '较冲', '稳', '较保', '保']
const DEFAULT_QUOTA = { 冲: 8, 稳: 12, 保: 10 }

/** §4.4 标准正态 CDF */
export function normalCdf(z) {
  return 0.5 * (1 + erf(z / Math.SQRT2))
}

function erf(x) {
  const sign = x < 0 ? -1 : 1
  const ax = Math.abs(x)
  const t = 1 / (1 + 0.3275911 * ax)
  const y =
    1 -
    (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t) *
      Math.exp(-ax * ax)
  return sign * y
}

/** §4.2 归一化权重 */
export function normalizeWeights(count) {
  const slice = DEFAULT_WEIGHTS.slice(0, count)
  const sum = slice.reduce((a, b) => a + b, 0)
  return slice.map((w) => w / sum)
}

/** §4.3 加权移动平均 */
export function weightedMovingAverage(values, weights) {
  if (!values.length) return null
  const w = weights ?? normalizeWeights(values.length)
  let sum = 0
  let wSum = 0
  for (let i = 0; i < values.length; i++) {
    if (values[i] == null || Number.isNaN(values[i])) continue
    sum += w[i] * values[i]
    wSum += w[i]
  }
  if (wSum === 0) return null
  return sum / wSum
}

function stdDev(values) {
  if (values.length < 2) return 500
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const variance = values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length
  return Math.max(500, Math.sqrt(variance))
}

/** §4.4 录取概率 */
export function calculateProbability(userRank, predictedMinRank, historicalRanks) {
  const sigma = stdDev(historicalRanks)
  const z = (predictedMinRank - userRank) / sigma
  const p = normalCdf(z)
  return Math.min(0.99, Math.max(0.01, Math.round(p * 10000) / 10000))
}

function levelByProbability(p) {
  if (p < 0.15) return '极冲'
  if (p < 0.35) return '冲'
  if (p < 0.5) return '较冲'
  if (p < 0.7) return '稳'
  if (p < 0.85) return '较保'
  return '保'
}

function levelByRankRatio(ratio) {
  if (ratio >= 1.4) return '极冲'
  if (ratio >= 1.25) return '冲'
  if (ratio >= 1.1) return '较冲'
  if (ratio >= 0.9) return '稳'
  if (ratio >= 0.75) return '较保'
  return '保'
}

/** §4.5 双判据合并 — 取更激进（index 更小）等级 */
export function classifyGradient(probability, rankRatio) {
  const byProb = levelByProbability(probability)
  const byRatio = levelByRankRatio(rankRatio)
  const idxProb = GRADIENT_LEVELS.indexOf(byProb)
  const idxRatio = GRADIENT_LEVELS.indexOf(byRatio)
  const gradientLevel = GRADIENT_LEVELS[Math.min(idxProb, idxRatio)]
  const tierLabel = gradientToTier(gradientLevel)
  return { gradientLevel, tierLabel }
}

export function gradientToTier(level) {
  if (level === '极冲' || level === '冲' || level === '较冲') return '冲'
  if (level === '稳') return '稳'
  return '保'
}

/** §2 E4 选科满足判定 */
export function satisfiesSubjectRequirement(userSubjects, requirement) {
  const req = (requirement || '').trim()
  if (!req || req === '不限') return true
  const subjects = (userSubjects || []).map((s) => String(s).trim())

  if (req.includes('或')) {
    const options = req.split('或').map((s) => s.trim()).filter(Boolean)
    return options.some((opt) => subjects.some((s) => s.includes(opt) || opt.includes(s)))
  }

  const parts = req.split(/[+和]/).map((s) => s.trim()).filter(Boolean)
  return parts.every((part) => subjects.some((s) => s.includes(part) || part.includes(s)))
}

/** §2 资格筛选 */
export function filterEligibleGroups(admissionRows, input) {
  const {
    province,
    subjectType,
    batchType = '本科',
    subjects = [],
    intendedMajors = [],
  } = input

  const filtered = admissionRows.filter((row) => {
    if (row.province !== province) return false
    if (row.subject_type !== subjectType) return false
    if ((row.batch_type || '本科') !== batchType) return false
    if (!satisfiesSubjectRequirement(subjects, row.subject_requirement)) return false
    if (intendedMajors?.length) {
      const major = row.major_name.toLowerCase()
      const match = intendedMajors.some((m) => major.includes(String(m).toLowerCase()))
      if (!match) return false
    }
    return true
  })

  const groups = new Map()
  for (const row of filtered) {
    const key = `${row.college_name}::${row.major_name}::${row.subject_type}::${row.batch_type || '本科'}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(row)
  }

  const eligible = []
  for (const [, rows] of groups) {
    if (rows.length < 2) continue // E5
    rows.sort((a, b) => b.year - a.year)
    eligible.push(rows)
  }
  return eligible
}

/** 对单组历年数据计算预测与概率 */
export function analyzeAdmissionGroup(rows, userRank) {
  const sorted = [...rows].sort((a, b) => b.year - a.year)
  const weights = normalizeWeights(sorted.length)
  const rankValues = sorted.map((r) => r.min_rank)
  const scoreValues = sorted.map((r) => r.avg_score).filter((v) => v != null)

  const predictedMinRank = Math.round(weightedMovingAverage(rankValues, weights))
  const predictedAvgScore = scoreValues.length
    ? Math.round(weightedMovingAverage(scoreValues, weights) * 10) / 10
    : null

  const probability = calculateProbability(userRank, predictedMinRank, rankValues)
  const rankRatio = Math.round((userRank / predictedMinRank) * 10000) / 10000
  const { gradientLevel, tierLabel } = classifyGradient(probability, rankRatio)

  const latest = sorted[0]
  return {
    collegeName: latest.college_name,
    majorName: latest.major_name,
    admissionDataId: latest.id,
    predictedRank: predictedMinRank,
    predictedMinRank,
    predictedAvgScore,
    probability,
    rankRatio,
    gradientLevel,
    tierLabel,
    minScore: latest.min_score,
    avgScore: predictedAvgScore ?? latest.avg_score,
    minRank: latest.min_rank,
    subjectRequirement: latest.subject_requirement,
    historicalYears: sorted.map((r) => r.year),
    extJson: { historicalRanks: rankValues },
  }
}

/** §4.6 生成完整推荐列表 */
export function generateVolunteerRecommendations(admissionRows, input) {
  const userRank = Number(input.rank)
  if (!userRank || userRank <= 0) {
    throw new Error('请提供有效的省排位次')
  }

  const quota = { ...DEFAULT_QUOTA, ...(input.inputExt?.quota || {}) }
  const groups = filterEligibleGroups(admissionRows, input)
  const analyzed = groups.map((g) => analyzeAdmissionGroup(g, userRank))

  const byTier = { 冲: [], 稳: [], 保: [] }
  for (const item of analyzed) {
    byTier[item.tierLabel].push(item)
  }

  for (const tier of Object.keys(byTier)) {
    byTier[tier].sort((a, b) => b.probability - a.probability)
  }

  const result = []
  for (const tier of ['冲', '稳', '保']) {
    const limit = quota[tier] ?? DEFAULT_QUOTA[tier]
    result.push(...byTier[tier].slice(0, limit))
  }

  return result.map((item, idx) => ({
    ...item,
    sortOrder: idx + 1,
  }))
}

export default {
  normalCdf,
  normalizeWeights,
  weightedMovingAverage,
  calculateProbability,
  classifyGradient,
  gradientToTier,
  satisfiesSubjectRequirement,
  filterEligibleGroups,
  analyzeAdmissionGroup,
  generateVolunteerRecommendations,
}
