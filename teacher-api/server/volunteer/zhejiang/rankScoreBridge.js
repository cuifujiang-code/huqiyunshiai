/**
 * 分数 ↔ 位次换算（对接 zhejiang_score_rank）
 */
import { ZHEJIANG_PROVINCE } from './constants.js'
import {
  lookupHistoricalSameRankScores,
  lookupRankByScore,
  lookupScoreByRank,
} from './scoreRankService.js'

const DATA_SOURCE_STUB = 'stub'

function estimateRankFromScoreStub(score, examYear) {
  const s = Number(score)
  if (!s || s <= 0) return null
  const maxRank = 290790
  const ratio = Math.max(0, Math.min(1, (s - 250) / 500))
  const yearFactor = 1 + (2025 - Number(examYear || 2025)) * 0.02
  return Math.round(maxRank * (1 - ratio) * yearFactor)
}

function estimateScoreFromRankStub(rank, examYear) {
  const r = Number(rank)
  if (!r || r <= 0) return null
  const maxRank = 290790
  const ratio = Math.max(0, Math.min(1, 1 - r / maxRank))
  const yearFactor = 1 - (2025 - Number(examYear || 2025)) * 0.01
  return Math.round((250 + ratio * 500) * yearFactor)
}

function normalizeParams(params = {}) {
  return {
    examYear: Number(params.examYear ?? params.year ?? new Date().getFullYear()),
    category: params.category || '普通类',
    subjectType: params.subjectType || '综合类',
    batch: params.batch ?? params.batchSegment ?? null,
    province: params.province || ZHEJIANG_PROVINCE,
  }
}

async function attachHistorical(supabase, base, params) {
  if (!base.success || !base.rank) return base
  const historical = await lookupHistoricalSameRankScores(supabase, {
    rank: base.rank,
    category: params.category,
    subjectType: params.subjectType,
    batch: params.batch,
  })
  return { ...base, historicalSameRankScores: historical }
}

export async function rankFromScore(params = {}, supabase = null) {
  const norm = normalizeParams(params)
  if (norm.province !== ZHEJIANG_PROVINCE) {
    return { success: false, message: '当前仅支持浙江省' }
  }

  if (supabase) {
    const result = await lookupRankByScore(supabase, {
      examYear: norm.examYear,
      score: params.score,
      category: norm.category,
      subjectType: norm.subjectType,
      batch: norm.batch,
    })
    if (result.success) {
      return attachHistorical(supabase, {
        ...result,
        score: Number(params.score),
        subjectType: params.subjectType || norm.subjectType,
      }, norm)
    }
    if (result.reference) return result
  }

  const rank = estimateRankFromScoreStub(params.score, norm.examYear)
  return {
    success: true,
    dataSource: DATA_SOURCE_STUB,
    rank,
    score: Number(params.score),
    examYear: norm.examYear,
    subjectType: params.subjectType || norm.subjectType,
    message: '一分一段表未命中，当前为估算位次（请确认已导入数据）',
  }
}

export async function scoreFromRank(params = {}, supabase = null) {
  const norm = normalizeParams(params)
  if (norm.province !== ZHEJIANG_PROVINCE) {
    return { success: false, message: '当前仅支持浙江省' }
  }

  if (supabase) {
    const result = await lookupScoreByRank(supabase, {
      examYear: norm.examYear,
      rank: params.rank,
      category: norm.category,
      subjectType: norm.subjectType,
      batch: norm.batch,
    })
    if (result.success) {
      return attachHistorical(supabase, {
        ...result,
        rank: Number(params.rank),
        subjectType: params.subjectType || norm.subjectType,
      }, norm)
    }
    if (result.reference) return result
  }

  const score = estimateScoreFromRankStub(params.rank, norm.examYear)
  return {
    success: true,
    dataSource: DATA_SOURCE_STUB,
    score,
    rank: Number(params.rank),
    examYear: norm.examYear,
    subjectType: params.subjectType || norm.subjectType,
    message: '一分一段表未命中，当前为估算分数',
  }
}

export async function convertScoreRank(params = {}, supabase = null) {
  if (params.rank != null && params.score == null) {
    return scoreFromRank(params, supabase)
  }
  return rankFromScore(params, supabase)
}
