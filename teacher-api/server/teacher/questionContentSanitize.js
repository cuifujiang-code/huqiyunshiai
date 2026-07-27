/**
 * 清理题干/解析中批量误附的 [附图: ...] 占位符。
 * Excel 部分题源会把整份文档的全部附图列表追加到每道题末尾。
 */
const IMAGE_REF_RE = /\[附图:\s*[^\]]+\]/g

export function countImagePlaceholders(text = '') {
  return (String(text).match(IMAGE_REF_RE) || []).length
}

export function stripImagePlaceholders(text = '', { maxKeep = 3 } = {}) {
  const raw = String(text ?? '')
  const refs = raw.match(IMAGE_REF_RE) || []
  if (!refs.length) return raw
  if (refs.length <= maxKeep) return raw

  let cleaned = raw.replace(/\s*,?\s*\[附图:\s*[^\]]+\]/g, '')
  cleaned = cleaned.replace(/\[附图:\s*[^\]]+\]\s*,?\s*/g, '')
  cleaned = cleaned.replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
  return cleaned
}

export function sanitizeQuestionContentFields(row = {}, options = {}) {
  const out = { ...row }
  for (const field of ['content', 'analysis', 'answer']) {
    if (out[field] != null && out[field] !== '') {
      out[field] = stripImagePlaceholders(out[field], options)
    }
  }
  return out
}
