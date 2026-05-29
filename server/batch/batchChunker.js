/** 将长试卷文本切分为 AI 可并发处理的小块（约 4000 字/块，支持 100～1000 题级文档） */

const DEFAULT_CHUNK = 4000

export function splitTextIntoChunks(text, maxLen = DEFAULT_CHUNK) {
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

/** 估算分块数量，用于大批量任务规划 */
export function estimateItemCount(textLength, maxLen = DEFAULT_CHUNK) {
  return Math.max(1, Math.ceil(textLength / maxLen))
}
