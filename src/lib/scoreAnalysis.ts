import type { ExamScoreRecord, ScoreAnalysisResult, SubjectScore } from '../types/planning'

function pct(score: number, full: number) {
  return full > 0 ? Math.round((score / full) * 1000) / 10 : 0
}

function trendFromDelta(delta: number): 'up' | 'stable' | 'down' {
  if (delta >= 3) return 'up'
  if (delta <= -3) return 'down'
  return 'stable'
}

/** 基于历次考试记录做量化成绩波动分析 */
export function analyzeScoreHistory(
  records: ExamScoreRecord[],
  electiveSubjects: string[] = [],
): ScoreAnalysisResult {
  if (records.length === 0) {
    return {
      recordCount: 0,
      overallTrend: 'stable',
      overallDelta: 0,
      volatilityIndex: 0,
      subjectInsights: [],
      weakSubjects: [],
      strongSubjects: [],
      rankTrend: null,
      summary: '暂无历次成绩，建议至少录入2次考试（如上下学期期末）后再生成规划。',
    }
  }

  const sorted = [...records].sort(
    (a, b) => new Date(a.examDate || 0).getTime() - new Date(b.examDate || 0).getTime(),
  )
  const latest = sorted[sorted.length - 1]
  const prev = sorted.length >= 2 ? sorted[sorted.length - 2] : null

  const subjectMap = new Map<string, number[]>()
  for (const rec of sorted) {
    for (const s of rec.subjectScores) {
      if (s.score == null) continue
      const arr = subjectMap.get(s.subject) ?? []
      arr.push(s.score)
      subjectMap.set(s.subject, arr)
    }
  }

  const subjectInsights = Array.from(subjectMap.entries()).map(([subject, scores]) => {
    const first = scores[0]
    const last = scores[scores.length - 1]
    const delta = last - first
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length
    const variance =
      scores.length > 1
        ? scores.reduce((sum, x) => sum + (x - avg) ** 2, 0) / (scores.length - 1)
        : 0
    const std = Math.sqrt(variance)
    const fullScore =
      latest.subjectScores.find((s) => s.subject === subject)?.fullScore ??
      prev?.subjectScores.find((s) => s.subject === subject)?.fullScore ??
      100

    return {
      subject,
      isElective: electiveSubjects.includes(subject),
      latestScore: last,
      firstScore: first,
      delta,
      avgScore: Math.round(avg * 10) / 10,
      volatility: Math.round(std * 10) / 10,
      ratePercent: pct(last, fullScore),
      trend: trendFromDelta(delta),
      examCount: scores.length,
    }
  })

  subjectInsights.sort((a, b) => a.ratePercent - b.ratePercent)

  const weakSubjects = subjectInsights
    .filter((s) => s.ratePercent < 75 || s.trend === 'down')
    .slice(0, 5)
    .map((s) => s.subject)

  const strongSubjects = subjectInsights
    .filter((s) => s.ratePercent >= 85 && s.trend !== 'down')
    .slice(-5)
    .map((s) => s.subject)

  const totalDeltas = subjectInsights.map((s) => Math.abs(s.delta))
  const volatilityIndex =
    totalDeltas.length > 0
      ? Math.round((totalDeltas.reduce((a, b) => a + b, 0) / totalDeltas.length) * 10) / 10
      : 0

  let overallDelta = 0
  if (latest.totalScore != null && prev?.totalScore != null) {
    overallDelta = latest.totalScore - prev.totalScore
  } else if (subjectInsights.length > 0) {
    overallDelta = Math.round(
      subjectInsights.reduce((sum, s) => sum + s.delta, 0) / subjectInsights.length,
    )
  }

  const rankTrend =
    latest.schoolRank != null && prev?.schoolRank != null
      ? {
          from: prev.schoolRank,
          to: latest.schoolRank,
          improved: latest.schoolRank < prev.schoolRank,
        }
      : null

  const latestLabel = `${latest.academicYear || ''}${latest.term || ''}${latest.examName || latest.examType}`
  const summaryParts = [
    `共 ${sorted.length} 次考试记录。`,
    `最近：${latestLabel}。`,
    weakSubjects.length > 0 ? `薄弱/下滑：${weakSubjects.join('、')}。` : '',
    strongSubjects.length > 0 ? `优势稳定：${strongSubjects.join('、')}。` : '',
    rankTrend
      ? `校排名 ${rankTrend.from} → ${rankTrend.to}（${rankTrend.improved ? '上升' : '下降'}）。`
      : '',
    volatilityIndex >= 8 ? '整体波动较大，需关注心态与复习节奏。' : '整体波动可控。',
  ]

  return {
    recordCount: sorted.length,
    overallTrend: trendFromDelta(overallDelta),
    overallDelta,
    volatilityIndex,
    subjectInsights,
    weakSubjects,
    strongSubjects,
    rankTrend,
    summary: summaryParts.filter(Boolean).join(''),
  }
}

/** 将最近一次考试同步到 subjectScores 主表 */
export function syncLatestScoresToForm(
  records: ExamScoreRecord[],
  existing: SubjectScore[],
): SubjectScore[] {
  if (records.length === 0) return existing
  const sorted = [...records].sort(
    (a, b) => new Date(b.examDate || 0).getTime() - new Date(a.examDate || 0).getTime(),
  )
  const latest = sorted[0]
  const oldMap = new Map(existing.map((s) => [s.subject, s]))
  const analysis = analyzeScoreHistory(records)

  return latest.subjectScores.map((s) => {
    const prev = oldMap.get(s.subject)
    const insight = analysis.subjectInsights.find((i) => i.subject === s.subject)
    return {
      subject: s.subject,
      score: s.score,
      fullScore: s.fullScore,
      classRank: s.classRank ?? prev?.classRank ?? null,
      schoolRank: s.schoolRank ?? prev?.schoolRank ?? null,
      scoreTrend: insight?.trend ?? prev?.scoreTrend ?? 'stable',
    }
  })
}

export function emptyScoreRecord(): ExamScoreRecord {
  const now = new Date()
  const year = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1
  return {
    id: crypto.randomUUID(),
    examName: '',
    examDate: now.toISOString().slice(0, 10),
    academicYear: `${year}-${year + 1}`,
    term: now.getMonth() >= 2 && now.getMonth() <= 7 ? '下学期' : '上学期',
    examType: '期末',
    subjectScores: [],
    totalScore: null,
    schoolRank: null,
    classRank: null,
  }
}
