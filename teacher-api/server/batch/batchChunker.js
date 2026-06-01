/**
 * 智能分块：优先按题号边界切分，绝不在题目中间截断
 */

const DEFAULT_CHUNK = Number(process.env.BATCH_CHUNK_MAX_LEN || 4000)
const QUESTIONS_PER_CHUNK = Number(process.env.BATCH_QUESTIONS_PER_CHUNK || 4)

/**
 * 题号行首模式（新题目开始）：
 * - 1. / 2． / 3、
 * - (1) / （1）
 * - 第1题
 */
const QUESTION_LINE_START_RE = /^\s*(?:(\d{1,3})[\.．、]|（(\d{1,3})）|\((\d{1,3})\)|第\s*(\d{1,3})\s*题)/

const QUESTION_SPLIT_LOOKAHEAD = /(?=^\s*(?:\d{1,3}[\.．、]|（\d{1,3}）|\(\d{1,3}\)|第\s*\d{1,3}\s*题|第\s*[一二三四五六七八九十百千]+题))/m

/** 统计题号行数（仅行首匹配，避免正文误计） */
export function countQuestionMarkers(text) {
  const s = String(text ?? '')
  if (!s.trim()) return 0
  let count = 0
  for (const line of s.split('\n')) {
    if (QUESTION_LINE_START_RE.test(line)) count += 1
  }
  return count
}

/** 从题目文本首行提取题号标签 */
export function extractQuestionLabel(questionText) {
  const firstLine = String(questionText ?? '').split('\n')[0] ?? ''
  const m = firstLine.match(QUESTION_LINE_START_RE)
  if (!m) return null
  return m[1] || m[2] || m[3] || m[4] || null
}

/** 按题号边界拆成完整单题列表（每元素 = 一道完整题，绝不截断） */
export function splitIntoCompleteQuestions(text) {
  const normalized = String(text ?? '').replace(/\r\n/g, '\n').trim()
  if (!normalized) return []

  const parts = normalized.split(QUESTION_SPLIT_LOOKAHEAD)
  const questions = parts.map((p) => p.trim()).filter(Boolean)

  if (questions.length <= 1) {
    return normalized ? [normalized] : []
  }

  return questions
}

/** @deprecated 兼容旧名 */
export function splitChunkByQuestions(text) {
  return splitIntoCompleteQuestions(text)
}

/** 将完整题目列表合并为分块（每块 ≤ maxLen 字，每块含若干整题） */
function mergeQuestionsIntoChunks(questions, maxLen = DEFAULT_CHUNK, questionsPerChunk = QUESTIONS_PER_CHUNK) {
  const chunks = []
  let buffer = []
  let bufferLen = 0

  const flush = () => {
    if (!buffer.length) return
    const text = buffer.join('\n\n')
    const labels = buffer.map(extractQuestionLabel).filter(Boolean)
    chunks.push({
      text,
      questionCount: buffer.length,
      questionLabels: labels,
      charLength: text.length,
    })
    buffer = []
    bufferLen = 0
  }

  for (const q of questions) {
    const qLen = q.length
    const sepLen = buffer.length ? 2 : 0

    // 单题超长：单独成块，绝不截断
    if (qLen > maxLen) {
      flush()
      chunks.push({
        text: q,
        questionCount: 1,
        questionLabels: [extractQuestionLabel(q)].filter(Boolean),
        charLength: qLen,
        oversized: true,
      })
      continue
    }

    const wouldExceedLen = buffer.length > 0 && bufferLen + sepLen + qLen > maxLen
    const wouldExceedCount = buffer.length >= questionsPerChunk

    if (wouldExceedLen || wouldExceedCount) {
      flush()
    }

    buffer.push(q)
    bufferLen = buffer.length === 1 ? qLen : bufferLen + sepLen + qLen
  }

  flush()
  return chunks
}

/** 无题号时的兜底：按空行分段，仍保证不在段内截断 */
function splitByParagraphs(text, maxLen = DEFAULT_CHUNK) {
  const normalized = String(text ?? '').trim()
  if (!normalized) return []

  const paragraphs = normalized.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
  if (!paragraphs.length) return [normalized]

  const chunks = []
  let buffer = []
  let bufferLen = 0

  const flush = () => {
    if (!buffer.length) return
    const text = buffer.join('\n\n')
    chunks.push({
      text,
      questionCount: buffer.length,
      questionLabels: [],
      charLength: text.length,
      fallback: 'paragraph',
    })
    buffer = []
    bufferLen = 0
  }

  for (const para of paragraphs) {
    if (para.length > maxLen) {
      flush()
      chunks.push({
        text: para,
        questionCount: 1,
        questionLabels: [],
        charLength: para.length,
        oversized: true,
        fallback: 'paragraph',
      })
      continue
    }

    const sepLen = buffer.length ? 2 : 0
    if (buffer.length > 0 && bufferLen + sepLen + para.length > maxLen) {
      flush()
    }

    buffer.push(para)
    bufferLen = buffer.length === 1 ? para.length : bufferLen + sepLen + para.length
  }

  flush()
  return chunks.map((c) => c.text)
}

function logChunkSummary(chunks, mode) {
  const summary = chunks.map((c, i) => ({
    index: i,
    questionCount: c.questionCount ?? 1,
    questionLabels: c.questionLabels ?? [],
    charLength: c.charLength ?? c.text?.length ?? 0,
    oversized: c.oversized ?? false,
  }))

  console.log('[batchChunker] 分块完成', {
    mode,
    chunkCount: chunks.length,
    totalQuestions: summary.reduce((n, s) => n + s.questionCount, 0),
    chunks: summary,
  })
}

/**
 * 主入口：智能分块，返回文本数组
 */
export function splitTextIntoChunks(text, maxLen = DEFAULT_CHUNK) {
  const normalized = String(text ?? '').replace(/\r\n/g, '\n').trim()
  if (!normalized) return []

  const markerCount = countQuestionMarkers(normalized)

  if (markerCount >= 1) {
    const questions = splitIntoCompleteQuestions(normalized)
    if (questions.length >= 1) {
      const chunkMeta = mergeQuestionsIntoChunks(questions, maxLen, QUESTIONS_PER_CHUNK)
      logChunkSummary(chunkMeta, markerCount >= 2 ? 'question_boundary' : 'single_question')
      return chunkMeta.map((c) => c.text)
    }
  }

  // 兜底：按段落，不在段内截断
  const paraChunks = splitByParagraphs(normalized, maxLen)
  console.log('[batchChunker] 按段落兜底切分', {
    textLength: normalized.length,
    chunkCount: paraChunks.length,
    markerCount,
  })
  return paraChunks
}

/** 估算分块数量 */
export function estimateItemCount(textLength, maxLen = DEFAULT_CHUNK) {
  return Math.max(1, Math.ceil(textLength / maxLen))
}
