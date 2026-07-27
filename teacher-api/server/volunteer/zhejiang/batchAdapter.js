/**
 * 浙江分段填报适配（一段 / 二段）
 */
import {
  ZHEJIANG_BATCH_SEGMENTS,
  ZHEJIANG_VOLUNTEER_LIMIT,
  mapBatchSegmentToLegacyType,
  mapLegacyTypeToBatchSegment,
} from './constants.js'

export function normalizeBatchSegment(batchSegment, batchType) {
  const seg = String(batchSegment || '').trim()
  if (ZHEJIANG_BATCH_SEGMENTS.includes(seg)) return seg
  return mapLegacyTypeToBatchSegment(batchType || '本科')
}

/** 将前端输入规范化为算法/数据库查询参数 */
export function adaptZhejiangInput(input = {}) {
  const batchSegment = normalizeBatchSegment(input.batchSegment, input.batchType)
  const examYear = Number(input.examYear || input.exam_year || new Date().getFullYear())
  return {
    ...input,
    province: '浙江',
    batchSegment,
    batchType: mapBatchSegmentToLegacyType(batchSegment),
    examYear,
    inputExt: {
      ...(input.inputExt || {}),
      batchSegment,
      examYear,
      zhejiang: true,
      volunteerLimit: ZHEJIANG_VOLUNTEER_LIMIT,
    },
  }
}

/** 按批次筛选投档计划行 */
export function filterByBatchSegment(rows = [], batchSegment) {
  const seg = normalizeBatchSegment(batchSegment)
  return rows.filter((row) => {
    const rowSeg = row.batch_segment || mapLegacyTypeToBatchSegment(row.batch_type)
    return rowSeg === seg
  })
}

/** 志愿表合规：数量不超过 80 */
export function validateVolunteerListLength(items = [], batchSegment = '一段') {
  const limit = ZHEJIANG_VOLUNTEER_LIMIT
  const count = items.length
  const issues = []
  if (count > limit) {
    issues.push({
      code: 'VOLUNTEER_OVERFLOW',
      level: 'error',
      message: `${batchSegment}最多填报 ${limit} 个志愿，当前 ${count} 个`,
    })
  }
  return { valid: issues.length === 0, issues, limit, count }
}

/** 一段/二段控制线占位（接入官方数据前） */
export function getBatchControlLineStub(examYear, subjectType, batchSegment) {
  const isPhysics = subjectType === '物理类'
  if (batchSegment === '一段') {
    return {
      dataSource: 'stub',
      scoreLine: isPhysics ? 492 : 490,
      rankHint: isPhysics ? 180000 : 200000,
      message: '控制线为参考占位，请以浙江省教育考试院当年公布为准',
    }
  }
  return {
    dataSource: 'stub',
    scoreLine: isPhysics ? 274 : 268,
    rankHint: isPhysics ? 280000 : 300000,
    message: '二段控制线为参考占位',
  }
}

export function checkBatchEligibility(input = {}) {
  const { rank, score, subjectType, batchSegment, examYear } = adaptZhejiangInput(input)
  const line = getBatchControlLineStub(examYear, subjectType, batchSegment)
  const issues = []
  if (rank && line.rankHint && batchSegment === '一段' && rank > line.rankHint * 1.5) {
    issues.push({
      code: 'BATCH_MAYBE_SECOND',
      level: 'warning',
      message: '位次偏后，请确认是否应填报二段或核对位次输入',
    })
  }
  if (score != null && score < line.scoreLine && batchSegment === '一段') {
    issues.push({
      code: 'BELOW_FIRST_SEGMENT',
      level: 'warning',
      message: `分数低于一段参考线（${line.scoreLine}），建议考虑二段批次`,
    })
  }
  return { valid: true, issues, controlLine: line }
}
