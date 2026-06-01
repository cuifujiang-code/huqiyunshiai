/**
 * 智能分块：仅按主题号切分，整卷优先，绝不在题目中间截断
 */

const DEFAULT_CHUNK = Number(process.env.BATCH_CHUNK_MAX_LEN || 8000)
const QUESTIONS_PER_CHUNK = Number(process.env.BATCH_QUESTIONS_PER_CHUNK || 10)
const WHOLE_PAPER_MAX_LEN = Number(process.env.BATCH_WHOLE_PAPER_MAX || 60000)

/**
 * 主题号行首（仅 1. 2. 12. 等，不含 A. B. 或 (1) 小题号）
 * 要求题号后紧跟非空白内容，避免误匹配页码/分数
 */
const MAIN_QUESTION_LINE_RE = /^\s*(\d{1,3})[\.．、]\s*\S/

const MAIN_QUESTION_SPLIT_LOOKAHEAD = /(?=^\s*\d{1,3}[\.．、]\s*\S)/m

/** 统计主题号行数 */
export function countQuestionMarkers(text) {
  const s = String(text ?? '')
  if (!s.trim()) return 0
  let count = 0
  for (const line of s.split('\n')) {
    if (MAIN_QUESTION_LINE_RE.test(line)) count += 1
  }
  return count
}

/** 从题目文本首行提取题号 */
export function extractQuestionLabel(questionText) {
  const firstLine = String(questionText ?? '').split('\n')[0] ?? ''
  const m = firstLine.match(MAIN_QUESTION_LINE_RE)
  return m ? m[1] : null
}

/** 按主题号边界拆成完整单题（不含 (1) 小题号切分） */
export function splitIntoCompleteQuestions(text) {
  const normalized = String(text ?? '').replace(/\r\n/g, '\n').trim()
  if (!normalized) return []

  const parts = normalized.split(MAIN_QUESTION_SPLIT_LOOKAHEAD)
  const questions = parts.map((p) => p.trim()).filter(Boolean)

  if (questions.length <= 1) {
    return normalized ? [normalized] : []
  }

  return questions
}

/** @deprecated */
export function splitChunkByQuestions(text) {
  return splitIntoCompleteQuestions(text)
}

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
    chunks.push({
      text: buffer.join('\n\n'),
      questionCount: buffer.length,
      questionLabels: [],
      charLength: buffer.join('\n\n').length,
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
  return chunks
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
 * 主入口：智能分块
 * - 标准试卷（≤20000字且≥5题）：整卷单块，保证 AI 看到完整上下文
 * - 否则按主题号切整题后合并
 */
export function splitTextIntoChunks(text, maxLen = DEFAULT_CHUNK) {
  const normalized = String(text ?? '').replace(/\r\n/g, '\n').trim()
  if (!normalized) return []

  const markerCount = countQuestionMarkers(normalized)

  // 整卷模式：一份卷通常 10~30 题，单次 AI 提取质量最高
  if (
    normalized.length <= WHOLE_PAPER_MAX_LEN
    && markerCount >= 5
    && markerCount <= 80
  ) {
    console.log('[batchChunker] 整卷单块模式', {
      textLength: normalized.length,
      markerCount,
      reason: '保证题目完整、避免碎片化',
    })
    return [normalized]
  }

  if (markerCount >= 2) {
    const questions = splitIntoCompleteQuestions(normalized)
    if (questions.length >= 2) {
      const chunkMeta = mergeQuestionsIntoChunks(questions, maxLen, QUESTIONS_PER_CHUNK)
      logChunkSummary(chunkMeta, 'main_question_boundary')
      return chunkMeta.map((c) => c.text)
    }
  }

  if (markerCount === 1) {
    console.log('[batchChunker] 单题整卷', { textLength: normalized.length })
    return [normalized]
  }

  const paraMeta = splitByParagraphs(normalized, maxLen)
  console.log('[batchChunker] 按段落兜底切分', {
    textLength: normalized.length,
    chunkCount: paraMeta.length,
    markerCount,
  })
  return paraMeta.map((c) => c.text)
}

export function estimateItemCount(textLength, maxLen = DEFAULT_CHUNK) {
  return Math.max(1, Math.ceil(textLength / maxLen))
}
