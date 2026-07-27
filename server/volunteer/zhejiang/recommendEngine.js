/**
 * 浙江冲稳保推荐引擎 — 封装通用 engine，以位次为核心
 */
import { generateVolunteerRecommendations } from '../../volunteerEngine.js'
import { validateZhejiangVolunteerInput } from './complianceChecker.js'
import { adaptZhejiangInput, filterByBatchSegment } from './batchAdapter.js'
import { satisfiesZhejiangSubjectRequirement } from './electiveValidator.js'
import { ZHEJIANG_TIER_RATIO, ZHEJIANG_VOLUNTEER_LIMIT } from './constants.js'

/** 将 zhejiang_admission_plans 行转为 engine 兼容格式 */
export function mapZhejiangPlanToAdmissionRow(plan) {
  const stats = Array.isArray(plan.historical_stats) ? plan.historical_stats : []
  if (stats.length >= 2) {
    return stats.map((s) => ({
      id: plan.id,
      college_name: plan.college_name,
      major_name: plan.major_name,
      college_code: plan.college_code,
      major_code: plan.major_code,
      province: '浙江',
      year: s.year ?? plan.exam_year,
      subject_type: plan.subject_type,
      batch_type: plan.batch_segment === '二段' ? '二段' : '本科',
      batch_segment: plan.batch_segment,
      min_rank: s.min_rank ?? plan.min_rank,
      avg_rank: s.avg_rank ?? plan.avg_rank,
      min_score: s.min_score ?? plan.min_score,
      avg_score: s.avg_score ?? plan.avg_score,
      enrollment_count: s.enrollment ?? plan.enrollment_plan,
      subject_requirement: plan.subject_requirement,
      ext_json: plan.ext_json ?? {},
    }))
  }
  return [{
    id: plan.id,
    college_name: plan.college_name,
    major_name: plan.major_name,
    college_code: plan.college_code,
    major_code: plan.major_code,
    province: '浙江',
    year: plan.exam_year,
    subject_type: plan.subject_type,
    batch_type: plan.batch_segment === '二段' ? '二段' : '本科',
    batch_segment: plan.batch_segment,
    min_rank: plan.min_rank,
    avg_rank: plan.avg_rank,
    min_score: plan.min_score,
    avg_score: plan.avg_score,
    enrollment_count: plan.enrollment_plan,
    subject_requirement: plan.subject_requirement,
    ext_json: plan.ext_json ?? {},
  }]
}

export function flattenZhejiangPlans(plans = []) {
  return plans.flatMap(mapZhejiangPlanToAdmissionRow)
}

export function generateZhejiangRecommendations(admissionRows, rawInput = {}) {
  const validation = validateZhejiangVolunteerInput(rawInput)
  if (!validation.valid) {
    const msg = validation.errors.map((e) => e.message).join('；')
    throw new Error(msg || '浙江志愿输入校验未通过')
  }

  const input = validation.adapted
  let rows = admissionRows

  if (input.batchSegment) {
    rows = filterByBatchSegment(rows, input.batchSegment)
  }

  rows = rows.filter((row) =>
    satisfiesZhejiangSubjectRequirement(input.subjects, row.subject_requirement),
  )

  const quotaScale = Math.min(1, ZHEJIANG_VOLUNTEER_LIMIT / 30)
  const baseQuota = { 冲: 8, 稳: 12, 保: 10 }
  input.inputExt = {
    ...input.inputExt,
    quota: {
      冲: Math.max(3, Math.round(baseQuota.冲 * quotaScale)),
      稳: Math.max(5, Math.round(baseQuota.稳 * quotaScale)),
      保: Math.max(3, Math.round(baseQuota.保 * quotaScale)),
    },
    tierRatio: ZHEJIANG_TIER_RATIO,
  }

  const result = generateVolunteerRecommendations(rows, input)
  return {
    ...result,
    compliance: {
      warnings: validation.warnings,
      batchSegment: input.batchSegment,
      examYear: input.examYear,
    },
    summary: {
      total: result.items.length,
      rush: result.items.filter((i) => i.tierLabel === '冲').length,
      stable: result.items.filter((i) => i.tierLabel === '稳').length,
      safe: result.items.filter((i) => i.tierLabel === '保').length,
    },
  }
}

export { adaptZhejiangInput, validateZhejiangVolunteerInput }
