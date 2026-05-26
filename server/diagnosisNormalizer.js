import { buildMockDiagnosisReport } from './mockDiagnosisData.js'

const NA = '暂无数据'

function str(value, fallback = NA) {
  const v = value == null ? '' : String(value).trim()
  return v || fallback
}

function num(value, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function fillLossAnalysis(items, fallback) {
  const colors = {
    knowledge: '#ef4444',
    ability: '#f97316',
    skill: '#eab308',
    psychology: '#3b82f6',
  }
  const labels = {
    knowledge: '知识缺陷型',
    ability: '能力不足型',
    skill: '应试技巧型',
    psychology: '心理因素型',
  }

  const source = Array.isArray(items) && items.length > 0 ? items : fallback
  const normalized = source.slice(0, 4).map((item, index) => {
    const type = ['knowledge', 'ability', 'skill', 'psychology'][index] || item.type || 'knowledge'
    return {
      type,
      label: str(item.label, labels[type] || NA),
      percentage: num(item.percentage, 25),
      color: str(item.color, colors[type] || '#3b82f6'),
      explanation: str(item.explanation),
    }
  })

  while (normalized.length < 4) {
    const type = ['knowledge', 'ability', 'skill', 'psychology'][normalized.length]
    normalized.push({
      type,
      label: labels[type],
      percentage: 25,
      color: colors[type],
      explanation: NA,
    })
  }

  const total = normalized.reduce((s, i) => s + i.percentage, 0)
  if (total !== 100 && total > 0) {
    normalized[0].percentage += 100 - total
  }

  return normalized
}

function fillWeakPoints(items, fallback) {
  const source = Array.isArray(items) && items.length > 0 ? items : fallback
  return source.slice(0, 5).map((item, index) => ({
    id: str(item.id, `wp${index + 1}`),
    name: str(item.name),
    weight: Math.min(5, Math.max(1, num(item.weight, 3))),
    typicalWrong: str(item.typicalWrong),
    correctSolution: str(item.correctSolution),
  }))
}

function fillWrongQuestions(items, fallback) {
  const source = Array.isArray(items) && items.length > 0 ? items : fallback
  return source.slice(0, 3).map((item, index) => ({
    id: str(item.id, `wq${index + 1}`),
    content: str(item.content),
    studentAnswer: str(item.studentAnswer),
    correctAnswer: str(item.correctAnswer),
    thinkingBlock: str(item.thinkingBlock),
  }))
}

function fillImprovementPlan(items, fallback) {
  const source = Array.isArray(items) && items.length > 0 ? items : fallback
  return source.slice(0, 14).map((day, index) => ({
    day: str(day.day, `Day ${index + 1}`),
    tasks: (Array.isArray(day.tasks) && day.tasks.length > 0 ? day.tasks : [{ id: `d${index + 1}`, text: NA, completed: false }]).map(
      (task, ti) => ({
        id: str(task.id, `d${index + 1}t${ti + 1}`),
        text: str(task.text),
        completed: Boolean(task.completed),
      }),
    ),
  }))
}

function fillRecommendedExercises(items, fallback) {
  const source = Array.isArray(items) && items.length > 0 ? items : fallback
  return source.slice(0, 5).map((item, index) => ({
    id: str(item.id, `ex${index + 1}`),
    content: str(item.content),
    type: str(item.type, '练习题'),
    difficulty: str(item.difficulty, '中等'),
  }))
}

export function normalizeDiagnosisReport(raw, form) {
  const fallback = buildMockDiagnosisReport(form)

  if (!raw || typeof raw !== 'object') {
    throw new Error('AI 返回的诊断报告格式不完整')
  }

  const scoreOverview = {
    ...fallback.scoreOverview,
    ...(raw.scoreOverview || {}),
    score: num(raw.scoreOverview?.score, form.score),
    fullScore: num(raw.scoreOverview?.fullScore, form.fullScore),
    gradeRank: raw.scoreOverview?.gradeRank ?? form.gradeRank ?? fallback.scoreOverview.gradeRank,
    trend: ['up', 'down', 'stable'].includes(raw.scoreOverview?.trend) ? raw.scoreOverview.trend : 'stable',
    trendDelta: num(raw.scoreOverview?.trendDelta, 0),
    percentile: num(raw.scoreOverview?.percentile, 50),
  }

  return {
    title: str(raw.title, `${form.subject}${form.examType} · AI学习诊断报告`),
    generatedAt: str(raw.generatedAt, new Date().toISOString()),
    scoreOverview,
    lossAnalysis: fillLossAnalysis(raw.lossAnalysis, fallback.lossAnalysis),
    weakPoints: fillWeakPoints(raw.weakPoints, fallback.weakPoints),
    wrongQuestions: fillWrongQuestions(raw.wrongQuestions, fallback.wrongQuestions),
    improvementPlan: fillImprovementPlan(raw.improvementPlan, fallback.improvementPlan),
    recommendedExercises: fillRecommendedExercises(raw.recommendedExercises, fallback.recommendedExercises),
    imageAnalysisSummary: form.examPaperText || form.answerSheetOcrText || form.ocrText
      ? str(raw.imageAnalysisSummary)
      : raw.imageAnalysisSummary
        ? str(raw.imageAnalysisSummary)
        : undefined,
    source: 'ai',
  }
}
