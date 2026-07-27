/**
 * 历年同位次院校对标 — 冲/稳/保 + 近三年录取数据
 */
import { generateZhejiangRecommendations, flattenZhejiangPlans } from './recommendEngine.js'
import { satisfiesZhejiangSubjectRequirement } from './electiveValidator.js'
import { filterByBatchSegment } from './batchAdapter.js'

function extractHistorical(row) {
  const stats = row.historical_stats ?? row.historicalAdmission ?? []
  if (Array.isArray(stats) && stats.length) {
    return stats.slice(0, 3).map((s) => ({
      year: s.year ?? s.exam_year,
      minRank: s.min_rank ?? s.minRank,
      minScore: s.min_score ?? s.minScore,
      enrollment: s.enrollment ?? s.enrollment_count ?? s.enrollmentCount,
    }))
  }
  return [{
    year: row.year ?? row.exam_year,
    minRank: row.min_rank ?? row.minRank,
    minScore: row.min_score ?? row.minScore,
    enrollment: row.enrollment_count ?? row.enrollment_plan,
  }].filter((h) => h.year)
}

function mapItemToBenchmark(item, userRank) {
  const refRank = item.predictedRank ?? item.minRank ?? 0
  const rankGap = refRank ? userRank - refRank : null
  let gapLabel = '稳'
  if (rankGap != null) {
    if (rankGap < -5000) gapLabel = '冲'
    else if (rankGap > 5000) gapLabel = '保'
  }
  return {
    tierLabel: item.tierLabel,
    gapLabel,
    rankGap,
    collegeName: item.collegeName,
    majorName: item.majorName,
    collegeCode: item.extJson?.collegeCode ?? '',
    majorCode: item.extJson?.majorCode ?? '',
    subjectRequirement: item.subjectRequirement,
    predictedRank: item.predictedRank,
    minRank: item.minRank,
    minScore: item.minScore,
    avgScore: item.avgScore,
    probability: item.probability,
    enrollmentPlan: item.extJson?.enrollmentPlan ?? null,
    historicalAdmission: item.historicalAdmission ?? extractHistorical(item),
  }
}

export function buildBenchmarkRecommendations(admissionRows, params = {}) {
  const userRank = Number(params.userRank ?? params.rank)
  if (!userRank || userRank <= 0) {
    return { success: false, message: '请提供有效位次 userRank', tiers: { 冲: [], 稳: [], 保: [] } }
  }

  const input = {
    province: '浙江',
    subjectType: params.subjectType || '物理类',
    subjects: params.subjects || [],
    rank: userRank,
    batchSegment: params.batchSegment || params.batch || '一段',
    examYear: params.examYear ?? params.year,
    intendedMajors: params.interestMajor
      ? [params.interestMajor, ...(params.intendedMajors || [])]
      : (params.intendedMajors || []),
    category: params.category || '普通类',
  }

  let rows = admissionRows
  if (input.batchSegment) rows = filterByBatchSegment(rows, input.batchSegment)
  rows = rows.filter((row) =>
    satisfiesZhejiangSubjectRequirement(input.subjects, row.subject_requirement),
  )

  if (!rows.length) {
    return {
      success: true,
      userRank,
      dataSource: 'empty',
      tiers: { 冲: [], 稳: [], 保: [] },
      message: '投档数据尚未接入，接入 zhejiang_admission_plans 后将返回对标院校',
    }
  }

  const result = generateZhejiangRecommendations(rows, input)
  const tiers = { 冲: [], 稳: [], 保: [] }
  for (const item of result.items) {
    const mapped = mapItemToBenchmark(item, userRank)
    tiers[item.tierLabel]?.push(mapped)
  }

  return {
    success: true,
    userRank,
    examYear: input.examYear,
    dataSource: 'admission_data',
    tiers,
    summary: result.summary,
    compliance: result.compliance,
  }
}

export { flattenZhejiangPlans }
