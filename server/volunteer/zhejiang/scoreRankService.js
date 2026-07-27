/**
 * 浙江一分一段表查询服务（zhejiang_score_rank）
 * 含内存缓存，支持分数↔位次、分数段分布、历年同位次参考
 */

const CACHE_TTL_MS = 5 * 60 * 1000
const cache = new Map()

const TABLE = 'zhejiang_score_rank'
const DEFAULT_CATEGORY = '普通类'
const AVAILABLE_YEARS = [2023, 2024, 2025]

function cacheKey(parts) {
  return parts.join('::')
}

function cacheGet(key) {
  const hit = cache.get(key)
  if (!hit || Date.now() > hit.exp) return null
  return hit.val
}

function cacheSet(key, val) {
  cache.set(key, { val, exp: Date.now() + CACHE_TTL_MS })
  if (cache.size > 500) {
    const first = cache.keys().next().value
    cache.delete(first)
  }
}

/** 志愿系统科类 → 一分一段表科类（浙江统一综合类） */
export function normalizeScoreRankSubjectType(subjectType) {
  if (!subjectType || subjectType === '综合' || subjectType === '综合类') return '综合类'
  return '综合类'
}

export function normalizeCategory(category) {
  return category?.trim() || DEFAULT_CATEGORY
}

function buildBaseQuery(supabase, { examYear, category, subjectType, batch }) {
  let q = supabase
    .from(TABLE)
    .select('*')
    .eq('exam_year', examYear)
    .eq('category', category)
    .eq('subject_type', subjectType)
  if (batch) q = q.eq('batch', batch)
  return q
}

async function getYearBounds(supabase, params) {
  const key = cacheKey(['bounds', params.examYear, params.category, params.subjectType, params.batch ?? ''])
  const cached = cacheGet(key)
  if (cached) return cached

  const { data, error } = await buildBaseQuery(supabase, params)
    .order('score', { ascending: false })
  if (error) throw new Error(error.message)
  if (!data?.length) return null

  const bounds = {
    minScore: data[data.length - 1].score,
    maxScore: data[0].score,
    minRank: data[0].rank,
    maxRank: data[data.length - 1].rank,
    totalStudent: data[0].total_student,
  }
  cacheSet(key, bounds)
  return bounds
}

function mapRow(row) {
  if (!row) return null
  return {
    examYear: row.exam_year,
    score: row.score,
    rank: row.rank,
    sectionNum: row.section_num,
    category: row.category,
    subjectType: row.subject_type,
    batch: row.batch,
    rankPercent: Number(row.rank_percent),
    totalStudent: row.total_student,
  }
}

/** 分数 → 位次（精确查表） */
export async function lookupRankByScore(supabase, params = {}) {
  const examYear = Number(params.examYear ?? params.year)
  const score = Number(params.score)
  const category = normalizeCategory(params.category)
  const subjectType = normalizeScoreRankSubjectType(params.subjectType)
  const batch = params.batch?.trim() || null

  if (!examYear || !AVAILABLE_YEARS.includes(examYear)) {
    return { success: false, message: `请选择有效高考年份（${AVAILABLE_YEARS.join('/')}）` }
  }
  if (!score || score < 0 || score > 750) {
    return { success: false, message: '分数须在 0-750 之间' }
  }

  const key = cacheKey(['score', examYear, category, subjectType, batch ?? '', score])
  const cached = cacheGet(key)
  if (cached) return { success: true, dataSource: TABLE, ...cached }

  const bounds = await getYearBounds(supabase, { examYear, category, subjectType, batch })
  if (!bounds) {
    return { success: false, message: '一分一段数据尚未导入，请先运行导入脚本' }
  }

  if (score > bounds.maxScore) {
    return {
      success: false,
      message: `分数 ${score} 超出 ${examYear} 年表内最高记录（${bounds.maxScore} 分）`,
      reference: { maxScore: bounds.maxScore, minRank: bounds.minRank },
    }
  }
  if (score < bounds.minScore) {
    return {
      success: false,
      message: `分数 ${score} 低于 ${examYear} 年表内最低记录（${bounds.minScore} 分）`,
      reference: { minScore: bounds.minScore, maxRank: bounds.maxRank },
    }
  }

  let q = buildBaseQuery(supabase, { examYear, category, subjectType, batch }).eq('score', score)
  const { data, error } = await q.maybeSingle()
  if (error) throw new Error(error.message)

  if (!data) {
    return {
      success: false,
      message: `未找到 ${examYear} 年 ${score} 分对应记录（可能存在分数缺口）`,
      reference: bounds,
    }
  }

  const result = mapRow(data)
  cacheSet(key, result)
  return { success: true, dataSource: TABLE, ...result }
}

/** 位次 → 分数（精确或最近邻） */
export async function lookupScoreByRank(supabase, params = {}) {
  const examYear = Number(params.examYear ?? params.year)
  const rank = Number(params.rank ?? params.userRank)
  const category = normalizeCategory(params.category)
  const subjectType = normalizeScoreRankSubjectType(params.subjectType)
  const batch = params.batch?.trim() || null

  if (!examYear || !AVAILABLE_YEARS.includes(examYear)) {
    return { success: false, message: `请选择有效高考年份（${AVAILABLE_YEARS.join('/')}）` }
  }
  if (!rank || rank <= 0) {
    return { success: false, message: '位次须为正整数' }
  }

  const key = cacheKey(['rank', examYear, category, subjectType, batch ?? '', rank])
  const cached = cacheGet(key)
  if (cached) return { success: true, dataSource: TABLE, ...cached }

  const bounds = await getYearBounds(supabase, { examYear, category, subjectType, batch })
  if (!bounds) {
    return { success: false, message: '一分一段数据尚未导入，请先运行导入脚本' }
  }

  if (rank < bounds.minRank) {
    return {
      success: false,
      message: `位次 ${rank} 优于 ${examYear} 年表内最优记录（${bounds.minRank} 名）`,
      reference: { minRank: bounds.minRank, maxScore: bounds.maxScore },
    }
  }
  if (rank > bounds.maxRank) {
    return {
      success: false,
      message: `位次 ${rank} 超出 ${examYear} 年表内范围（最大 ${bounds.maxRank} 名）`,
      reference: { maxRank: bounds.maxRank, minScore: bounds.minScore },
    }
  }

  let { data: exact } = await buildBaseQuery(supabase, { examYear, category, subjectType, batch })
    .eq('rank', rank)
    .maybeSingle()

  if (!exact) {
    const { data: gteRows } = await buildBaseQuery(supabase, { examYear, category, subjectType, batch })
      .gte('rank', rank)
      .order('score', { ascending: true })
      .limit(1)
    exact = gteRows?.[0] ?? null
  }

  if (!exact) {
    const { data: lteRows } = await buildBaseQuery(supabase, { examYear, category, subjectType, batch })
      .lte('rank', rank)
      .order('score', { ascending: false })
      .limit(1)
    exact = lteRows?.[0] ?? null
  }

  if (!exact) {
    return { success: false, message: '未找到对应位次记录', reference: bounds }
  }

  const result = { ...mapRow(exact), matchedRank: exact.rank, requestedRank: rank }
  cacheSet(key, result)
  return { success: true, dataSource: TABLE, ...result }
}

/** 历年同位次参考分数（2023-2025） */
export async function lookupHistoricalSameRankScores(supabase, params = {}) {
  const rank = Number(params.rank)
  const category = normalizeCategory(params.category)
  const subjectType = normalizeScoreRankSubjectType(params.subjectType)
  const batch = params.batch?.trim() || null
  const years = params.years ?? AVAILABLE_YEARS

  if (!rank || rank <= 0) return []

  const results = []
  for (const year of years) {
    const res = await lookupScoreByRank(supabase, {
      examYear: year,
      rank,
      category,
      subjectType,
      batch,
    })
    if (res.success) {
      results.push({
        examYear: year,
        score: res.score,
        rank: res.rank,
        sectionNum: res.sectionNum,
        rankPercent: res.rankPercent,
        totalStudent: res.totalStudent,
      })
    }
  }
  return results
}

/** 分数段人数分布 */
export async function queryScoreDistribution(supabase, params = {}) {
  const examYear = Number(params.examYear ?? params.year)
  const startScore = Number(params.startScore ?? params.start_score)
  const endScore = Number(params.endScore ?? params.end_score)
  const category = normalizeCategory(params.category)
  const subjectType = normalizeScoreRankSubjectType(params.subjectType)
  const batch = params.batch?.trim() || null

  if (!examYear || !AVAILABLE_YEARS.includes(examYear)) {
    return { success: false, message: `请选择有效高考年份（${AVAILABLE_YEARS.join('/')}）` }
  }
  if (Number.isNaN(startScore) || Number.isNaN(endScore)) {
    return { success: false, message: '请提供 startScore 与 endScore' }
  }
  const lo = Math.min(startScore, endScore)
  const hi = Math.max(startScore, endScore)

  const key = cacheKey(['dist', examYear, category, subjectType, batch ?? '', lo, hi])
  const cached = cacheGet(key)
  if (cached) return { success: true, dataSource: TABLE, ...cached }

  const { data, error } = await buildBaseQuery(supabase, { examYear, category, subjectType, batch })
    .gte('score', lo)
    .lte('score', hi)
    .order('score', { ascending: false })

  if (error) throw new Error(error.message)
  if (!data?.length) {
    return { success: false, message: `${examYear} 年 ${lo}-${hi} 分区间无数据` }
  }

  const segments = data.map(mapRow)
  const totalInRange = segments.reduce((s, r) => s + (r.sectionNum ?? 0), 0)
  const rankMin = Math.min(...segments.map((s) => s.rank))
  const rankMax = Math.max(...segments.map((s) => s.rank))

  const result = {
    examYear,
    startScore: lo,
    endScore: hi,
    rankRange: { min: rankMin, max: rankMax },
    totalStudents: totalInRange,
    segmentCount: segments.length,
    density: segments.map((s) => ({
      score: s.score,
      rank: s.rank,
      sectionNum: s.sectionNum,
      rankPercent: s.rankPercent,
    })),
  }
  cacheSet(key, result)
  return { success: true, dataSource: TABLE, ...result }
}

export { AVAILABLE_YEARS, TABLE }
