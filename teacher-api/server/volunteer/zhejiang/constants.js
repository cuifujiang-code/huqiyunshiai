/**
 * 浙江省高考志愿填报 — 规则常量
 */

export const ZHEJIANG_PROVINCE = '浙江'

export const ZHEJIANG_ELECTIVE_SUBJECTS = [
  '物理', '化学', '生物', '历史', '地理', '政治', '技术',
]

export const ZHEJIANG_SUBJECT_TYPES = ['物理类', '历史类']

export const ZHEJIANG_BATCH_SEGMENTS = ['一段', '二段']

/** 普通类平行志愿每批最多 80 个「专业+学校」志愿 */
export const ZHEJIANG_VOLUNTEER_LIMIT = 80

export const ZHEJIANG_ELECTIVE_COUNT = 3

/** 冲稳保建议占比（位次梯度核心） */
export const ZHEJIANG_TIER_RATIO = {
  冲: { min: 0.15, max: 0.30, label: '冲' },
  稳: { min: 0.40, max: 0.50, label: '稳' },
  保: { min: 0.20, max: 0.35, label: '保' },
}

/** 位次比区间 → 冲稳保（浙江以位次为核心） */
export const ZHEJIANG_RANK_RATIO_TIER = [
  { min: 1.25, tier: '冲', gradient: '冲' },
  { min: 1.1, tier: '冲', gradient: '较冲' },
  { min: 0.9, tier: '稳', gradient: '稳' },
  { min: 0.75, tier: '保', gradient: '较保' },
  { min: 0, tier: '保', gradient: '保' },
]

export const ZHEJIANG_RULES_SUMMARY = {
  mode: '专业+学校平行志愿',
  elective: '7选3（每门等级赋分，取3门计入高考总分）',
  batchNote: '普通类分一段、二段两次填报，每段最多80个平行志愿',
  rankFirst: '推荐算法以省排位次为核心，分数仅作参考与换算',
  subjectMatch: '须满足院校专业的选考科目要求方可填报',
}

export const ZHEJIANG_RULES_SECTIONS = [
  {
    title: '平行志愿模式',
    content: '浙江普通类采用「专业+学校」平行志愿。一段、二段分别填报，每段最多可填 80 个志愿，每个志愿为 1 个专业 + 1 所院校。',
  },
  {
    title: '选考科目（7选3）',
    content: '从物理、化学、生物、历史、地理、政治、技术中任选 3 门。院校专业可要求 1 门或多门选考科目，不满足要求不能填报。',
  },
  {
    title: '一段 / 二段',
    content: '一段线上考生填报普通类一段计划；二段线上考生及一段未录取考生填报二段计划。请根据当年控制线确认所属批次。',
  },
  {
    title: '冲稳保策略',
    content: '以位次比（您的位次 ÷ 院校专业预测位次）为核心：位次比 >1.1 偏冲，0.9–1.1 偏稳，<0.9 偏保。建议冲 20%–30%、稳 40%–50%、保 20%–30%。',
  },
  {
    title: '数据说明',
    content: '已接入 2023-2025 年浙江省普通类一分一段表，支持分数与位次精确换算；投档计划数据持续更新中。',
  },
]

/** 一段/二段 → 兼容 college_admission_data.batch_type */
export function mapBatchSegmentToLegacyType(batchSegment) {
  return batchSegment === '二段' ? '二段' : '本科'
}

export function mapLegacyTypeToBatchSegment(batchType) {
  if (batchType === '二段' || batchType === '专科') return '二段'
  return '一段'
}
