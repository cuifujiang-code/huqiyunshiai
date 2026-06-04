import { callDeepSeekAI } from '../deepseekClient.js'
import { repairJSON } from '../batch/jsonRepairEngine.js'
import { pickQuestionsForExam } from './questionBankStore.js'

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function pickByCriteria(pool, { question_type, difficulty, count }) {
  const filtered = pool.filter(
    (q) => q.question_type === question_type && (!difficulty || q.difficulty === difficulty),
  )
  return shuffle(filtered).slice(0, count)
}

async function aiGenerateQuestion({ subject, grade, question_type, difficulty, knowledge_point }) {
  const prompt = `生成一道${grade}${subject}${question_type}，难度${difficulty}，知识点：${knowledge_point || '综合'}。
返回 JSON：{ content, options, answer, analysis, knowledge_point }`
  const content = await callDeepSeekAI('只输出 JSON', prompt)
  const q = repairJSON(content)
  return {
    subject,
    grade,
    knowledge_point: q.knowledge_point || knowledge_point || '',
    question_type,
    difficulty,
    content: q.content,
    options: q.options ?? [],
    answer: q.answer || '',
    analysis: q.analysis || '',
    source: 'AI生成',
    tags: ['组卷补充'],
  }
}

export async function buildSmartExam(teacherId, config) {
  const pool = await pickQuestionsForExam(teacherId, config)
  const sections = []
  let questionNo = 1

  for (const row of config.typeDistribution ?? []) {
    const { question_type, count, scorePerQuestion, difficultyMix } = row
    const picked = []
    const difficulties = difficultyMix
      ? ['基础', '中等', '拔高'].flatMap((d, i) => Array(difficultyMix[i] || 0).fill(d))
      : Array(count).fill('中等')

    for (let i = 0; i < count; i++) {
      const diff = difficulties[i] || '中等'
      let q = pickByCriteria(pool, { question_type, difficulty: diff, count: 1 })[0]
      if (!q) {
        q = await aiGenerateQuestion({
          subject: config.subject,
          grade: config.grade,
          question_type,
          difficulty: diff,
          knowledge_point: config.knowledgeCoverage,
        })
        q.id = `ai-${Date.now()}-${i}`
      }
      picked.push({ ...q, number: questionNo++, score: scorePerQuestion || 0 })
    }
    sections.push({ question_type, questions: picked })
  }

  const totalScore = sections.reduce(
    (sum, s) => sum + s.questions.reduce((a, q) => a + (q.score || 0), 0),
    0,
  )

  return {
    title: config.title || `${config.grade}${config.subject}测试卷`,
    subject: config.subject,
    grade: config.grade,
    totalScore,
    sections,
    generatedAt: new Date().toISOString(),
  }
}
