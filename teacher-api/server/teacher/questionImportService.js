import { decomposeTextToQuestions } from '../batch/robustDecomposer.js'

const BATCH_CHAR_LIMIT = 6000

/** 解析试卷，保留公式图与插图元数据供 normalizer 替换占位符 */
export async function parseExamDocument(examBuffer, fileName, meta = {}) {
  const { parseExamFile } = await import('../examParser.js')
  const parsed = await parseExamFile(examBuffer, fileName, meta)
  if (!parsed.text?.trim()) {
    throw new Error('试卷解析结果为空')
  }
  return {
    text: parsed.text,
    formulaImages: parsed.formulaImages || [],
    images: parsed.images || [],
  }
}

/** @deprecated 仅返回文本；新代码请用 parseExamDocument */
export async function parseExamText(examBuffer, fileName, meta = {}) {
  const doc = await parseExamDocument(examBuffer, fileName, meta)
  return doc.text
}

/** 稳健 AI 拆题（与批量拆题同一套 prompt + 占位符修复） */
export async function aiSplitExamText(text, meta) {
  return decomposeTextToQuestions(text, meta)
}

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
  const sharedMeta = { ...meta }

  for (let i = 0; i < batches.length; i++) {
    sharedMeta.startSort = all.length
    const batchQuestions = await aiSplitExamText(batches[i], sharedMeta)
    all.push(...batchQuestions)
    if (onBatchDone) {
      await onBatchDone(all, { total: batches.length, completed: i + 1, nextIndex: i + 1 })
    }
  }

  return all
}

export async function splitExamToQuestions(examBuffer, fileName, meta) {
  const doc = await parseExamDocument(examBuffer, fileName, meta)
  return aiSplitExamText(doc.text, {
    ...meta,
    formulaImages: doc.formulaImages,
    images: doc.images,
  })
}
