import type { ExamDataReference, ScoreSegment } from '../types/planning'

export const LATEST_EXAM_DATA_YEAR = 2025

export function seg(score: number, cumulativeRank: number, sameScoreCount?: number): ScoreSegment {
  return sameScoreCount != null
    ? { score, cumulativeRank, sameScoreCount }
    : { score, cumulativeRank }
}

type SubjectEntry = ExamDataReference['subjects'][number]

export function buildExamRef(params: {
  province: string
  city: string
  examType: '中考' | '高考'
  subjects: SubjectEntry[]
  keySchools: ExamDataReference['keySchools']
  source: string
  updatedAt?: string
}): ExamDataReference {
  return {
    province: params.province,
    city: params.city,
    year: LATEST_EXAM_DATA_YEAR,
    examType: params.examType,
    subjects: params.subjects,
    keySchools: params.keySchools,
    updatedAt: params.updatedAt ?? `${LATEST_EXAM_DATA_YEAR}-07-01T00:00:00.000Z`,
    source: params.source,
  }
}

export function subjectTotal(
  topScore: number,
  avgScore: number,
  cutoffLines: { tier: string; score: number }[],
  scoreSegments?: ScoreSegment[],
): SubjectEntry {
  return { subject: '总分', avgScore, topScore, cutoffLines, scoreSegments }
}

export function trackSubject(
  track: string,
  topScore: number,
  avgScore: number,
  cutoffLines: { tier: string; score: number }[],
  scoreSegments?: ScoreSegment[],
): SubjectEntry {
  return { subject: track, avgScore, topScore, cutoffLines, scoreSegments }
}

/** 根据控制线锚点估算一分一段（用于暂无官方明细的省份） */
export function estimateSegments(
  maxScore: number,
  teKong: number,
  benKe: number,
  zhuanKe: number,
  totalCandidates: number,
): ScoreSegment[] {
  const ratio = (s: number) =>
    Math.max(1, Math.round(totalCandidates * Math.pow((s - zhuanKe) / (maxScore - zhuanKe), 1.8)))
  return [
    seg(maxScore, Math.round(totalCandidates * 0.0001)),
    seg(maxScore - 20, ratio(maxScore - 20)),
    seg(maxScore - 40, ratio(maxScore - 40)),
    seg(maxScore - 60, ratio(maxScore - 60)),
    seg(maxScore - 80, ratio(maxScore - 80)),
    seg(teKong, ratio(teKong)),
    seg(Math.round((teKong + benKe) / 2), ratio(Math.round((teKong + benKe) / 2))),
    seg(benKe, ratio(benKe)),
    seg(Math.round((benKe + zhuanKe) / 2), ratio(Math.round((benKe + zhuanKe) / 2))),
    seg(zhuanKe, totalCandidates),
  ]
}
