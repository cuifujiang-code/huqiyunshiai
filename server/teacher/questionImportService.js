import { parseExamFile } from '../examParser.js'
import { callDeepSeekAI, extractJson } from '../deepseekClient.js'

const SYSTEM = '你是 K12 试卷拆题专家。只输出合法 JSON 数组，不要 markdown。'

function buildSplitPrompt(text, meta) {
  return `将以下试卷文本拆分为独立题目，识别题型、知识点、难度、答案与解析。

学科：${meta.subject || '未指定'}
年级：${meta.grade || '未指定'}

试卷原文：
${text.slice(0, 12000)}

输出 JSON 数组，每项字段：
subject, grade, knowledge_point, question_type, difficulty, content, options(选择题选项数组), answer, analysis, tags(字符串数组)

question_type 只能是：选择题/填空题/计算题/证明题/实验题/应用题
difficulty 只能是：基础/中等/拔高`
}

export async function splitExamToQuestions(examBuffer, fileName, meta) {
  const parsed = await parseExamFile(examBuffer, fileName)
  if (!parsed.text?.trim()) {
    throw new Error('试卷解析结果为空')
  }

  const content = await callDeepSeekAI(SYSTEM, buildSplitPrompt(parsed.text, meta))
  const raw = JSON.parse(extractJson(content))
  const list = Array.isArray(raw) ? raw : raw.questions ?? []

  return list.map((q, i) => ({
    subject: q.subject || meta.subject || '物理',
    grade: q.grade || meta.grade || '八年级',
    knowledge_point: q.knowledge_point || '',
    question_type: q.question_type || '应用题',
    difficulty: q.difficulty || '中等',
    content: q.content || `题目 ${i + 1}`,
    options: Array.isArray(q.options) ? q.options : [],
    answer: q.answer || '',
    analysis: q.analysis || '',
    source: '试卷导入',
    tags: Array.isArray(q.tags) ? q.tags : [],
  }))
}
