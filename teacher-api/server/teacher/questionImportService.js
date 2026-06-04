import { callDeepSeekAI } from '../deepseekClient.js'
import { repairJSON } from '../batch/jsonRepairEngine.js'

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

function normalizeQuestions(raw, meta) {
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

export async function parseExamText(examBuffer, fileName) {
  const { parseExamFile } = await import('../examParser.js')
  const parsed = await parseExamFile(examBuffer, fileName)
  if (!parsed.text?.trim()) {
    throw new Error('试卷解析结果为空')
  }
  return parsed.text
}

export async function aiSplitExamText(text, meta) {
  const content = await callDeepSeekAI(SYSTEM, buildSplitPrompt(text, meta))
  const raw = repairJSON(content)
  return normalizeQuestions(raw, meta)
}

const BATCH_CHAR_LIMIT = 6000

/** 将长试卷文本按段落切分为多个 AI 批次 */
export function splitTextIntoBatches(text, maxLen = BATCH_CHAR_LIMIT) {
  const normalized = text.trim()
  if (!normalized) return []
  if (normalized.length <= maxLen) return [normalized]

  const batches = []
  let start = 0
  while (start < normalized.length) {
    let end = Math.min(start + maxLen, normalized.length)
    if (end < normalized.length) {
      const slice = normalized.slice(start, end)
      const lastBreak = Math.max(slice.lastIndexOf('\n\n'), slice.lastIndexOf('\n'))
      if (lastBreak > maxLen * 0.4) {
        end = start + lastBreak
      }
    }
    const chunk = normalized.slice(start, end).trim()
    if (chunk) batches.push(chunk)
    start = Math.max(end, start + 1)
  }
  return batches
}

/** 分批调用 AI 拆题，每批完成后回调 onBatchDone */
export async function aiSplitExamTextInBatches(text, meta, onBatchDone) {
  const batches = splitTextIntoBatches(text)
  const all = []

  for (let i = 0; i < batches.length; i++) {
    const batchQuestions = await aiSplitExamText(batches[i], meta)
    all.push(...batchQuestions)
    if (onBatchDone) {
      await onBatchDone(all, { total: batches.length, completed: i + 1, nextIndex: i + 1 })
    }
  }

  return all
}

export async function splitExamToQuestions(examBuffer, fileName, meta) {
  const text = await parseExamText(examBuffer, fileName)
  return aiSplitExamText(text, meta)
}
