/**
 * 同位次院校推荐框架（预留）
 */
import { satisfiesZhejiangSubjectRequirement } from './electiveValidator.js'
import { filterByBatchSegment } from './batchAdapter.js'

/**
 * 同位次区间推荐
 * @param {object} params - { rank, subjectType, batchSegment, subjects, windowRatio }
 * @param {Array} admissionRows - 投档数据行
 */
export function recommendSameRankColleges(params = {}, admissionRows = []) {
  const rank = Number(params.rank)
  if (!rank || rank <= 0) {
    return { success: false, message: '请提供有效位次', items: [] }
  }

  const windowRatio = Number(params.windowRatio) || 0.08
  const minRank = Math.round(rank * (1 - windowRatio))
  const maxRank = Math.round(rank * (1 + windowRatio))
  const subjects = params.subjects || []
  const batchSegment = params.batchSegment || '一段'

  let rows = filterByBatchSegment(admissionRows, batchSegment)
  rows = rows.filter((row) => {
    if (params.subjectType && row.subject_type !== params.subjectType) return false
    const r = row.min_rank ?? row.minRank
    if (r == null) return false
    if (r < minRank || r > maxRank) return false
    return satisfiesZhejiangSubjectRequirement(subjects, row.subject_requirement)
  })

  const grouped = new Map()
  for (const row of rows) {
    const key = `${row.college_name}::${row.major_name}`
    if (!grouped.has(key)) grouped.set(key, row)
  }

  const items = [...grouped.values()]
    .map((row) => ({
      collegeName: row.college_name,
      majorName: row.major_name,
      collegeCode: row.college_code || '',
      majorCode: row.major_code || '',
      minRank: row.min_rank,
      minScore: row.min_score,
      subjectRequirement: row.subject_requirement,
      rankDelta: (row.min_rank ?? 0) - rank,
      batchSegment,
    }))
    .sort((a, b) => Math.abs(a.rankDelta) - Math.abs(b.rankDelta))
    .slice(0, params.limit ?? 20)

  return {
    success: true,
    dataSource: admissionRows.length ? 'admission_data' : 'empty',
    rank,
    window: { minRank, maxRank },
    total: items.length,
    items,
    message: admissionRows.length
      ? undefined
      : '投档数据尚未接入，返回空列表。接入 zhejiang_admission_plans 后将自动填充',
  }
}
