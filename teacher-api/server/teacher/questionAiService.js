import { callDeepSeekAI, extractJson } from '../deepseekClient.js'
import { repairJSON } from '../batch/jsonRepairEngine.js'
import * as questionBank from './questionBankStore.js'

function pickSimilarityScore(a, b) {
  let score = 0
  if (a.subject === b.subject) score += 2
  if (a.grade === b.grade) score += 1
  if (a.question_type === b.question_type) score += 1
  if (a.difficulty === b.difficulty) score += 2
  if (a.knowledge_point && b.knowledge_point && a.knowledge_point === b.knowledge_point) score += 4
  if (a.knowledge_point && b.knowledge_point && b.knowledge_point.includes(a.knowledge_point.split('/')[0])) score += 2
  return score
}

export async function generateVariantQuestion(question) {
  const prompt = `基于以下题目生成一道同考点、同难度（${question.difficulty}）的变式题。保持学科${question.subject}、年级${question.grade}、题型${question.question_type}。
知识点：${question.knowledge_point || '未标注'}
原题题干：${question.content}
原题答案：${question.answer}
原题解析：${question.analysis || '无'}

只输出 JSON：{"content","options","answer","analysis","knowledge_point"}`
  const raw = await callDeepSeekAI('你是资深命题教师，只输出合法 JSON', prompt, { temperature: 0.75, maxTokens: 4096 })
  const parsed = JSON.parse(repairJSON(extractJson(raw)))
  return {
    subject: question.subject,
    grade: question.grade,
    question_type: question.question_type,
    difficulty: question.difficulty,
    knowledge_point: parsed.knowledge_point || question.knowledge_point,
    knowledge_point_ids: question.knowledge_point_ids ?? [],
    content: parsed.content,
    options: parsed.options ?? question.options ?? [],
    answer: parsed.answer,
    analysis: parsed.analysis || '',
    source: 'AI生成',
    ability_dimension: question.ability_dimension || '',
    suitable_stage: question.suitable_stage || '',
    estimated_time: question.estimated_time,
    tags: [...(question.tags ?? []), 'AI变式题'],
    visibility: question.visibility || 'personal',
  }
}

export async function recommendSimilarQuestions(teacherId, question, limit = 8) {
  const { items } = await questionBank.listQuestions(teacherId, {
    subject: question.subject,
    page: 1,
    pageSize: 50,
    visibility: 'personal',
  })
  const scored = (items ?? [])
    .filter((q) => q.id !== question.id)
    .map((q) => ({ question: q, score: pickSimilarityScore(question, q) }))
    .filter((x) => x.score >= 3)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
  return scored.map((x) => x.question)
}

export async function generateWrongAnswerExplanation(question) {
  const prompt = `为以下题目撰写「错题讲解」，包含：1.解题步骤 2.关键思路 3.易错点分析 4.同类题提醒。
学科：${question.subject} 年级：${question.grade} 题型：${question.question_type}
题干：${question.content}
选项：${JSON.stringify(question.options ?? [])}
答案：${question.answer}
现有解析：${question.analysis || '无'}

用 Markdown + LaTeX（$...$）输出，不要 JSON。`
  return callDeepSeekAI('你是耐心的高中教师，擅长错题诊断讲解', prompt, { temperature: 0.5, maxTokens: 4096 })
}

export async function batchGenerateAnalysis(teacherId, questionIds = []) {
  const results = []
  for (const id of questionIds) {
    const q = await questionBank.getQuestion(teacherId, id)
    if (!q) {
      results.push({ id, success: false, message: '题目不存在' })
      continue
    }
    if (q.analysis && q.analysis.trim() && q.analysis !== '暂无') {
      results.push({ id, success: false, message: '已有解析，已跳过' })
      continue
    }
    try {
      const prompt = `为以下题目撰写标准解析（Markdown/LaTeX，含关键步骤与易错点）：
学科${q.subject} ${q.grade} ${q.question_type}
题干：${q.content}
答案：${q.answer}
选项：${JSON.stringify(q.options ?? [])}`
      const analysis = await callDeepSeekAI('只输出解析正文，不要 JSON', prompt, { temperature: 0.4, maxTokens: 2048 })
      const updated = await questionBank.updateQuestion(teacherId, id, { ...q, analysis: analysis.trim() })
      results.push({ id, success: true, question: updated })
    } catch (err) {
      results.push({ id, success: false, message: err.message })
    }
  }
  return { results, updated: results.filter((r) => r.success).length, skipped: results.filter((r) => !r.success).length }
}

async function loadQuestionOrThrow(teacherId, qid) {
  const question = await questionBank.getQuestion(teacherId, qid)
  if (!question) throw new Error('题目不存在')
  return question
}

export async function generateVariantQuestionForId(teacherId, qid) {
  const question = await loadQuestionOrThrow(teacherId, qid)
  const variant = await generateVariantQuestion(question)
  return variant
}

export async function recommendSimilarQuestionsForId(teacherId, qid, limit = 8) {
  const question = await loadQuestionOrThrow(teacherId, qid)
  return recommendSimilarQuestions(teacherId, question, limit)
}

export async function generateWrongAnswerExplanationForId(teacherId, qid) {
  const question = await loadQuestionOrThrow(teacherId, qid)
  return generateWrongAnswerExplanation(question)
}
