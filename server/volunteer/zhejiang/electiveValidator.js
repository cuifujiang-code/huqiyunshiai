/**
 * 浙江选考科目校验（7选3）
 */
import {
  ZHEJIANG_ELECTIVE_COUNT,
  ZHEJIANG_ELECTIVE_SUBJECTS,
  ZHEJIANG_PROVINCE,
  ZHEJIANG_SUBJECT_TYPES,
} from './constants.js'

export function isZhejiangProvince(province) {
  return String(province || '').trim() === ZHEJIANG_PROVINCE
}

/** 校验选考科目数量与合法性 */
export function validateElectiveSubjects(subjects = []) {
  const issues = []
  const list = (Array.isArray(subjects) ? subjects : []).map((s) => String(s).trim()).filter(Boolean)
  const invalid = list.filter((s) => !ZHEJIANG_ELECTIVE_SUBJECTS.includes(s))
  if (invalid.length) {
    issues.push({ code: 'INVALID_ELECTIVE', level: 'error', message: `无效选考科目：${invalid.join('、')}` })
  }
  if (list.length !== ZHEJIANG_ELECTIVE_COUNT) {
    issues.push({
      code: 'ELECTIVE_COUNT',
      level: 'error',
      message: `浙江实行7选3，须恰好选择 ${ZHEJIANG_ELECTIVE_COUNT} 门选考科目（当前 ${list.length} 门）`,
    })
  }
  const dup = list.filter((s, i) => list.indexOf(s) !== i)
  if (dup.length) {
    issues.push({ code: 'ELECTIVE_DUP', level: 'error', message: '选考科目不能重复' })
  }
  return { valid: issues.filter((i) => i.level === 'error').length === 0, issues, subjects: list }
}

/** 校验科类与选考组合是否匹配 */
export function validateSubjectTypeMatch(subjectType, subjects = []) {
  const issues = []
  const hasPhysics = subjects.includes('物理')
  const hasHistory = subjects.includes('历史')
  if (subjectType === '物理类' && !hasPhysics) {
    issues.push({ code: 'PHYSICS_REQUIRED', level: 'error', message: '物理类考生选考须包含物理' })
  }
  if (subjectType === '历史类' && !hasHistory) {
    issues.push({ code: 'HISTORY_REQUIRED', level: 'error', message: '历史类考生选考须包含历史' })
  }
  if (subjectType === '物理类' && hasHistory && !hasPhysics) {
    issues.push({ code: 'TYPE_MISMATCH', level: 'warning', message: '物理类通常不应仅选历史而不选物理' })
  }
  if (!ZHEJIANG_SUBJECT_TYPES.includes(subjectType)) {
    issues.push({ code: 'INVALID_SUBJECT_TYPE', level: 'error', message: '浙江仅支持物理类、历史类' })
  }
  return { valid: issues.filter((i) => i.level === 'error').length === 0, issues }
}

/** 院校专业选考要求是否满足（复用 engine 逻辑，浙江别名） */
export function satisfiesZhejiangSubjectRequirement(userSubjects, requirement) {
  const req = String(requirement || '').trim()
  if (!req || req === '不限') return true
  const subjects = (userSubjects || []).map((s) => String(s).trim())

  if (req.includes('或')) {
    const options = req.split('或').map((s) => s.trim()).filter(Boolean)
    return options.some((opt) => subjects.some((s) => s.includes(opt) || opt.includes(s)))
  }

  const parts = req.split(/[+和、]/).map((s) => s.trim()).filter(Boolean)
  return parts.every((part) => subjects.some((s) => s.includes(part) || part.includes(s)))
}

export function validateElectiveForRequirement(subjects, requirement) {
  if (satisfiesZhejiangSubjectRequirement(subjects, requirement)) {
    return { valid: true, issues: [] }
  }
  return {
    valid: false,
    issues: [{
      code: 'SUBJECT_REQUIREMENT',
      level: 'error',
      message: `选考科目不满足要求「${requirement}」`,
    }],
  }
}

export function validateZhejiangElectives(input = {}) {
  const { subjects = [], subjectType = '' } = input
  const countResult = validateElectiveSubjects(subjects)
  const typeResult = validateSubjectTypeMatch(subjectType, countResult.subjects)
  const issues = [...countResult.issues, ...typeResult.issues]
  return {
    valid: issues.filter((i) => i.level === 'error').length === 0,
    issues,
    subjects: countResult.subjects,
  }
}
