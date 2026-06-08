/**
 * 中高考参考数据入口（2025 届）
 */
import type { ExamDataReference } from '../types/planning'
import { LATEST_EXAM_DATA_YEAR } from './examReferenceHelpers'
import { lookupGaokaoByProvince } from './gaokaoProvinces2025'
import { lookupZhejiangZhongkao } from './zhejiangZhongkao2025'

export { LATEST_EXAM_DATA_YEAR }

export interface SubjectFullScoreConfig {
  subject: string
  fullScore: number
}

export const SUBJECT_FULL_SCORES: Record<
  string,
  { 中考: SubjectFullScoreConfig[]; 高考: SubjectFullScoreConfig[] }
> = {
  浙江: {
    中考: [
      { subject: '语文', fullScore: 120 },
      { subject: '数学', fullScore: 120 },
      { subject: '英语', fullScore: 120 },
      { subject: '科学', fullScore: 160 },
      { subject: '社会·法治', fullScore: 100 },
      { subject: '体育', fullScore: 40 },
    ],
    高考: [
      { subject: '语文', fullScore: 150 },
      { subject: '数学', fullScore: 150 },
      { subject: '英语', fullScore: 150 },
      { subject: '物理', fullScore: 100 },
      { subject: '化学', fullScore: 100 },
      { subject: '生物', fullScore: 100 },
      { subject: '历史', fullScore: 100 },
      { subject: '地理', fullScore: 100 },
      { subject: '政治', fullScore: 100 },
      { subject: '技术', fullScore: 100 },
    ],
  },
  江苏: {
    中考: [
      { subject: '语文', fullScore: 120 },
      { subject: '数学', fullScore: 120 },
      { subject: '英语', fullScore: 120 },
      { subject: '物理', fullScore: 100 },
      { subject: '化学', fullScore: 100 },
      { subject: '道德与法治', fullScore: 100 },
      { subject: '历史', fullScore: 100 },
      { subject: '体育', fullScore: 40 },
    ],
    高考: [
      { subject: '语文', fullScore: 150 },
      { subject: '数学', fullScore: 150 },
      { subject: '英语', fullScore: 150 },
      { subject: '物理', fullScore: 100 },
      { subject: '化学', fullScore: 100 },
      { subject: '生物', fullScore: 100 },
      { subject: '历史', fullScore: 100 },
      { subject: '地理', fullScore: 100 },
      { subject: '政治', fullScore: 100 },
    ],
  },
  北京: {
    中考: [
      { subject: '语文', fullScore: 100 },
      { subject: '数学', fullScore: 100 },
      { subject: '英语', fullScore: 100 },
      { subject: '物理', fullScore: 80 },
      { subject: '化学', fullScore: 80 },
      { subject: '道德与法治', fullScore: 80 },
      { subject: '历史', fullScore: 80 },
      { subject: '体育', fullScore: 50 },
    ],
    高考: [
      { subject: '语文', fullScore: 150 },
      { subject: '数学', fullScore: 150 },
      { subject: '英语', fullScore: 150 },
      { subject: '物理', fullScore: 100 },
      { subject: '化学', fullScore: 100 },
      { subject: '生物', fullScore: 100 },
      { subject: '历史', fullScore: 100 },
      { subject: '地理', fullScore: 100 },
      { subject: '政治', fullScore: 100 },
    ],
  },
  上海: {
    中考: [
      { subject: '语文', fullScore: 150 },
      { subject: '数学', fullScore: 150 },
      { subject: '英语', fullScore: 150 },
      { subject: '综合', fullScore: 150 },
      { subject: '体育', fullScore: 30 },
    ],
    高考: [
      { subject: '语文', fullScore: 150 },
      { subject: '数学', fullScore: 150 },
      { subject: '英语', fullScore: 150 },
      { subject: '物理', fullScore: 70 },
      { subject: '化学', fullScore: 70 },
      { subject: '生物', fullScore: 70 },
      { subject: '历史', fullScore: 70 },
      { subject: '地理', fullScore: 70 },
      { subject: '政治', fullScore: 70 },
    ],
  },
  default: {
    中考: [
      { subject: '语文', fullScore: 120 },
      { subject: '数学', fullScore: 120 },
      { subject: '英语', fullScore: 120 },
      { subject: '科学', fullScore: 160 },
      { subject: '社会·法治', fullScore: 80 },
      { subject: '体育', fullScore: 40 },
    ],
    高考: [
      { subject: '语文', fullScore: 150 },
      { subject: '数学', fullScore: 150 },
      { subject: '英语', fullScore: 150 },
      { subject: '物理', fullScore: 100 },
      { subject: '化学', fullScore: 100 },
      { subject: '生物', fullScore: 100 },
      { subject: '历史', fullScore: 100 },
      { subject: '地理', fullScore: 100 },
      { subject: '政治', fullScore: 100 },
    ],
  },
}

export function getSubjectFullScores(
  province: string,
  examType: '中考' | '高考',
): SubjectFullScoreConfig[] {
  const cfg = SUBJECT_FULL_SCORES[province] ?? SUBJECT_FULL_SCORES.default
  return cfg[examType]
}

export function lookupExamReference(
  province: string,
  city: string,
  examType: '中考' | '高考',
): ExamDataReference {
  if (examType === '高考') {
    const gaokao = lookupGaokaoByProvince(province, city)
    if (gaokao) return gaokao
  }

  if (examType === '中考' && province === '浙江') {
    const zhongkao = lookupZhejiangZhongkao(city)
    if (zhongkao) return zhongkao
  }

  const isGaokao = examType === '高考'
  return {
    province,
    city,
    year: LATEST_EXAM_DATA_YEAR,
    examType,
    subjects: [{
      subject: '总分',
      avgScore: isGaokao ? 520 : 480,
      topScore: isGaokao ? 680 : 620,
      cutoffLines: isGaokao
        ? [
            { tier: '特控线', score: 500 },
            { tier: '本科线', score: 430 },
            { tier: '专科线', score: 200 },
          ]
        : [
            { tier: '重高线', score: 550 },
            { tier: '普高线', score: 480 },
            { tier: '职高分线', score: 350 },
          ],
    }],
    keySchools: [
      { name: `${city}第一中学`, minScore: isGaokao ? 600 : 580, ranking: 1 },
      { name: `${city}实验高级中学`, minScore: isGaokao ? 570 : 550, ranking: 2 },
      { name: `${province}重点中学(${city})`, minScore: isGaokao ? 560 : 540, ranking: 3 },
    ],
    updatedAt: `${LATEST_EXAM_DATA_YEAR}-07-01T00:00:00.000Z`,
    source: `${LATEST_EXAM_DATA_YEAR}年${province}${city}${examType}通用参考（估算，请以当地官方发布为准）`,
  }
}
