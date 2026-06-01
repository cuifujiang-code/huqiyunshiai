/** 将长试卷文本切分为 AI 可并发处理的小块（优先按题号切分，支持整卷多题） */

const DEFAULT_CHUNK = 4000
const QUESTIONS_PER_CHUNK = 4

/** 题号起始模式：1. 2、 （1） 第1题 等 */
const QUESTION_MARKER_RE = /(?:^|\n)\s*(?:(?:\d{1,3})[\.．、\)）]|（\d{1,3}）|第\s*\d{1,3}\s*题|第\s*[一二三四五六七八九十百千]+题)/gm

/** 统计文本中题号出现次数 */
export function countQuestionMarkers(text) {
  const s = String(text ?? '')
  if (!s.trim()) return 0
  const matches = s.match(QUESTION_MARKER_RE)
  return matches?.length ?? 0
}

/** 按题号边界拆成单题/小题文本片段 */
export function splitChunkByQuestions(text) {
  const normalized = String(text ?? '').trim()
  if (!normalized) return []

  const parts = normalized.split(
    /(?=(?:^|\n)\s*(?:(?:\d{1,3})[\.．、\)）]|（\d{1,3}）|第\s*\d{1,3}\s*题|第\s*[一二三四五六七八九十百千]+题))/m,
  )

  const chunks = parts.map((p) => p.trim()).filter(Boolean)
  if (chunks.length <= 1) return normalized ? [normalized] : []
  return chunks
}

/** 按题号分组后再合并为每块 QUESTIONS_PER_CHUNK 题，且不超过 maxLen */
function splitByQuestionMarkers(text, questionsPerChunk = QUESTIONS_PER_CHUNK, maxLen = DEFAULT_CHUNK) {
  const parts = splitChunkByQuestions(text)
  if (parts.length <= 1) return []

  const chunks = []
  let buffer = ''
  let questionsInBuffer = 0

  for (const part of parts) {
    const wouldExceedLen = buffer && buffer.length + part.length + 1 > maxLen
    const wouldExceedCount = questionsInBuffer >= questionsPerChunk

    if (wouldExceedLen || wouldExceedCount) {
      if (buffer.trim()) chunks.push(buffer.trim())
      buffer = part
      questionsInBuffer = 1
    } else {
      buffer = buffer ? `${buffer}\n${part}` : part
      questionsInBuffer += 1
    }
  }

  if (buffer.trim()) chunks.push(buffer.trim())
  return chunks
}

/** 按字符长度切分（无题号时的兜底） */
function splitByLength(text, maxLen) {
  const normalized = String(text || '').trim()
  if (!normalized) return []
  if (normalized.length <= maxLen) return [normalized]

  const chunks = []
  let start = 0
  while (start < normalized.length) {
    let end = Math.min(start + maxLen, normalized.length)
    if (end < normalized.length) {
      const slice = normalized.slice(start, end)
      const breaks = [
        slice.lastIndexOf('\n\n'),
        slice.lastIndexOf('\n'),
        slice.lastIndexOf('。'),
        slice.lastIndexOf('；'),
      ]
      const best = Math.max(...breaks)
      if (best > maxLen * 0.35) end = start + best + 1
    }
    const chunk = normalized.slice(start, end).trim()
    if (chunk) chunks.push(chunk)
    start = Math.max(end, start + 1)
  }
  return chunks
}

export function splitTextIntoChunks(text, maxLen = DEFAULT_CHUNK) {
  const normalized = String(text || '').trim()
  if (!normalized) return []

  const markerCount = countQuestionMarkers(normalized)
  if (markerCount >= 2) {
    const byQuestions = splitByQuestionMarkers(normalized, QUESTIONS_PER_CHUNK, maxLen)
    if (byQuestions.length > 0) {
      console.log('[batchChunker] 按题号切分', {
        markerCount,
        chunkCount: byQuestions.length,
        questionsPerChunk: QUESTIONS_PER_CHUNK,
      })
      return byQuestions
    }
  }

  const byLength = splitByLength(normalized, maxLen)
  console.log('[batchChunker] 按长度切分', { textLength: normalized.length, chunkCount: byLength.length })
  return byLength
}

/** 估算分块数量 */
export function estimateItemCount(textLength, maxLen = DEFAULT_CHUNK) {
  return Math.max(1, Math.ceil(textLength / maxLen))
}
