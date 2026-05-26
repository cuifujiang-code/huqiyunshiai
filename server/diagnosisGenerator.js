import { buildMockDiagnosisReport } from './mockDiagnosisData.js'
import { callQiniuAI, extractJson } from './qiniuClient.js'

const MOCK_FALLBACK_MESSAGE = 'AI服务暂不可用，已展示示例诊断报告'

function buildDiagnosisPrompt(form) {
  return `你是一位资深 K12 学习诊断专家。请根据以下学生考试信息，生成一份完整的学习诊断报告 JSON。

【考试信息】
- 考试类型：${form.examType}
- 学科：${form.subject}
- 得分：${form.score} / ${form.fullScore}
- 年级排名：${form.gradeRank ?? '未提供'}
- 学生困惑：${form.confusion || '未填写'}

【输出要求】
1. 只返回 JSON，不要 markdown 代码块
2. 必须包含字段：title, generatedAt(ISO时间), scoreOverview, lossAnalysis(4项百分比之和100), weakPoints(3-5项), wrongQuestions(2项), improvementPlan(14天每天1-2任务), recommendedExercises(5项)
3. lossAnalysis 的 type 只能是 knowledge/ability/skill/psychology
4. scoreOverview 包含 score, fullScore, gradeRank, trend(up/down/stable), trendDelta, percentile
5. improvementPlan 格式：[{ "day": "Day 1", "tasks": [{ "id": "d1", "text": "任务", "completed": false }] }]`
}

function normalizeReport(raw, form) {
  if (!raw?.title || !raw?.scoreOverview || !Array.isArray(raw.lossAnalysis)) {
    throw new Error('AI 返回的诊断报告格式不完整')
  }

  const fallback = buildMockDiagnosisReport(form)

  return {
    title: raw.title || fallback.title,
    generatedAt: raw.generatedAt || new Date().toISOString(),
    scoreOverview: {
      ...fallback.scoreOverview,
      ...raw.scoreOverview,
      score: Number(raw.scoreOverview.score ?? form.score),
      fullScore: Number(raw.scoreOverview.fullScore ?? form.fullScore),
    },
    lossAnalysis: raw.lossAnalysis.length >= 4 ? raw.lossAnalysis : fallback.lossAnalysis,
    weakPoints: Array.isArray(raw.weakPoints) && raw.weakPoints.length > 0 ? raw.weakPoints : fallback.weakPoints,
    wrongQuestions:
      Array.isArray(raw.wrongQuestions) && raw.wrongQuestions.length > 0
        ? raw.wrongQuestions
        : fallback.wrongQuestions,
    improvementPlan:
      Array.isArray(raw.improvementPlan) && raw.improvementPlan.length > 0
        ? raw.improvementPlan
        : fallback.improvementPlan,
    recommendedExercises:
      Array.isArray(raw.recommendedExercises) && raw.recommendedExercises.length > 0
        ? raw.recommendedExercises
        : fallback.recommendedExercises,
    source: 'ai',
  }
}

export async function generateDiagnosis(form) {
  try {
    const aiContent = await callQiniuAI(
      '你是专业的 K12 学情诊断专家，只输出合法 JSON，不使用 markdown 格式。',
      buildDiagnosisPrompt(form),
    )
    const parsed = JSON.parse(extractJson(aiContent))
    const report = normalizeReport(parsed, form)
    return {
      report,
      message: '诊断报告生成成功（七牛云 AI）',
      isMockFallback: false,
    }
  } catch (error) {
    console.warn('七牛云 AI 诊断不可用，使用演示数据:', error instanceof Error ? error.message : error)
    const report = { ...buildMockDiagnosisReport(form), source: 'mock' }
    return {
      report,
      message: MOCK_FALLBACK_MESSAGE,
      isMockFallback: true,
    }
  }
}

export { MOCK_FALLBACK_MESSAGE }
