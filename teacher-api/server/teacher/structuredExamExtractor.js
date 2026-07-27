/**
 * 结构化试卷直接提取（原文已含题干/答案/解析时跳过 AI 拆题）
 */
import { normalizeQuestionsBatch } from '../batch/questionNormalizer.js'
import { filterCompleteQuestions } from '../batch/questionCompleteness.js'

const QUESTION_START_RE = /(?:^|\n)\s*(?:(\d{1,3})[.．、\)]\s*|[（(](\d{1,2})[)）]\s*|第\s*(\d{1,3})\s*题)/g

function countStructuredMarkers(text) {
  const s = String(text ?? '')
  let n = 0
  for (const re of [
    /(?:^|\n)\s*\d{1,3}[.．、\)]/g,
    /(?:^|\n)\s*[（(]\d{1,2}[)）]/g,
    /(?:^|\n)\s*第\s*\d{1,3}\s*题/g,
  ]) {
    n += (s.match(re) || []).length
  }
  return n
}

/** 是否像「已排版试卷+答案解析」 */
export function isStructuredExamText(text) {
  const s = String(text ?? '').trim()
  if (s.length < 200) return false

  const qCount = countStructuredMarkers(s)
  const hasAnswer = /(?:^|\n)\s*(?:答案|【答案】|参考答案|答\s*[:：])/m.test(s)
  const hasAnalysis = /(?:^|\n)\s*(?:解析|【解析】|详解|解\s*[:：])/m.test(s)
  const hasOptions = /(?:^|\n)\s*[A-DＡ-Ｄ][.．、\)]/m.test(s)

  return qCount >= 2 && (hasAnswer || hasAnalysis) && (hasOptions || qCount >= 3)
}

function splitBlocks(text) {
  const s = String(text ?? '').trim()
  const markers = []
  const re = /(?:^|\n)\s*(?:(\d{1,3})[.．、\)]\s*|[（(](\d{1,2})[)）]\s*|第\s*(\d{1,3})\s*题\s*)/g
  let m
  while ((m = re.exec(s)) !== null) {
    const num = Number(m[1] || m[2] || m[3] || 0)
    if (num > 0 && num <= 200) {
      markers.push({ index: m.index, num })
    }
  }
  if (markers.length < 2) return []

  const blocks = []
  for (let i = 0; i < markers.length; i++) {
    const start = markers[i].index
    const end = i + 1 < markers.length ? markers[i + 1].index : s.length
    blocks.push({ num: markers[i].num, body: s.slice(start, end).trim() })
  }
  return blocks
}

function extractField(block, labels) {
  for (const label of labels) {
    const re = new RegExp(`(?:^|\\n)\\s*${label}\\s*[:：]?\\s*([\\s\\S]*?)(?=\\n\\s*(?:答案|解析|【答案】|【解析】|详解|答\\s*[:：]|\\d{1,3}[.．、\\)]|[（(]\\d{1,2}[)）]|第\\s*\\d+\\s*题)|$)`, 'i')
    const m = block.match(re)
    if (m?.[1]?.trim()) return m[1].trim()
  }
  return ''
}

function extractOptions(block) {
  const options = []
  const re = /(?:^|\n)\s*([A-DＡ-Ｄ])[.．、\)]\s*([^\n]+)/g
  let m
  while ((m = re.exec(block)) !== null) {
    options.push(`${m[1].replace(/[Ａ-Ｄ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))}. ${m[2].trim()}`)
  }
  return options
}

function stripMetaFromContent(block) {
  let content = block
  content = content.replace(/(?:^|\n)\s*(?:答案|【答案】|参考答案|答\s*[:：])[\s\S]*$/i, '')
  content = content.replace(/(?:^|\n)\s*(?:解析|【解析】|详解|解\s*[:：])[\s\S]*$/i, '')
  return content.trim()
}

function guessQuestionType(content, options) {
  if (options.length >= 2) return '选择题'
  if (/填空|____|___/.test(content)) return '填空题'
  if (/证明/.test(content)) return '证明题'
  if (/计算|求|解方程/.test(content)) return '计算题'
  return '解答题'
}

/**
 * 从结构化试卷文本直接提取题目数组
 * @returns {object[]|null} null 表示不适用
 */
export function tryExtractStructuredQuestions(text, meta = {}) {
  if (!isStructuredExamText(text)) return null

  const blocks = splitBlocks(text)
  if (blocks.length < 2) return null

  const rawQuestions = blocks.map((b, i) => {
    const options = extractOptions(b.body)
    let content = stripMetaFromContent(b.body)
    content = content.replace(/^(?:\d{1,3}[.．、\)]\s*|[（(]\d{1,2}[)）]\s*|第\s*\d{1,3}\s*题\s*)/, '').trim()

    const answer = extractField(b.body, ['答案', '【答案】', '参考答案', '答'])
    const analysis = extractField(b.body, ['解析', '【解析】', '详解', '解'])

    return {
      subject: meta.subject || '数学',
      grade: meta.grade || '八年级',
      knowledge_point: '',
      question_type: guessQuestionType(content, options),
      difficulty: '中等',
      content: content || `题目 ${b.num || i + 1}`,
      options,
      answer: answer || '暂无',
      analysis: analysis || '暂无',
      source: '试卷导入',
      tags: ['结构化提取'],
      sort_order: i + 1,
      question_number: String(b.num || i + 1),
    }
  })

  const taskMeta = {
    subject: meta.subject,
    grade: meta.grade,
    formulaImages: meta.formulaImages || [],
    images: meta.images || [],
  }
  const { valid } = normalizeQuestionsBatch(rawQuestions, taskMeta, 0)
  const questions = filterCompleteQuestions(valid)

  if (questions.length < 2) return null

  console.log('[structuredExamExtractor] 直接提取', {
    blocks: blocks.length,
    valid: questions.length,
  })

  return questions
}
