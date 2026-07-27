/**
 * 浙江志愿合规校验（生成前）
 */
import { validateZhejiangElectives } from './electiveValidator.js'
import { adaptZhejiangInput, checkBatchEligibility, validateVolunteerListLength } from './batchAdapter.js'
import { ZHEJIANG_BATCH_SEGMENTS, ZHEJIANG_PROVINCE } from './constants.js'

export function validateZhejiangVolunteerInput(input = {}) {
  const issues = []
  const warnings = []
  const errors = []

  if (String(input.province || '').trim() !== ZHEJIANG_PROVINCE) {
    return { valid: true, issues: [], province: input.province, zhejiang: false }
  }

  const adapted = adaptZhejiangInput(input)

  if (!adapted.examYear || adapted.examYear < 2020) {
    errors.push({ code: 'EXAM_YEAR', level: 'error', message: '请选择有效的高考年份' })
  }

  if (!ZHEJIANG_BATCH_SEGMENTS.includes(adapted.batchSegment)) {
    errors.push({ code: 'BATCH', level: 'error', message: '请选择一段或二段批次' })
  }

  const rank = Number(adapted.rank)
  if (!rank || rank <= 0) {
    errors.push({ code: 'RANK', level: 'error', message: '请输入有效的省排位次' })
  }

  const elective = validateZhejiangElectives(adapted)
  elective.issues.forEach((i) => (i.level === 'error' ? errors : warnings).push(i))

  const batchCheck = checkBatchEligibility(adapted)
  batchCheck.issues.forEach((i) => (i.level === 'error' ? errors : warnings).push(i))

  const all = [...errors, ...warnings]
  return {
    valid: errors.length === 0,
    zhejiang: true,
    adapted,
    issues: all,
    errors,
    warnings,
  }
}

export function validateZhejiangVolunteerItems(items = [], batchSegment = '一段') {
  const lengthCheck = validateVolunteerListLength(items, batchSegment)
  return {
    valid: lengthCheck.valid,
    issues: lengthCheck.issues,
    ...lengthCheck,
  }
}
