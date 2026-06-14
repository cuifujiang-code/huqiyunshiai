/** 构建题库全文检索字段 */
export function buildQuestionSearchText(payload = {}) {
  const options = Array.isArray(payload.options) ? payload.options : []
  return [
    payload.content,
    payload.answer,
    payload.analysis,
    ...options,
  ].filter(Boolean).join('\n').trim()
}

export function escapeIlikePattern(raw) {
  return String(raw ?? '').replace(/[%_\\]/g, (m) => `\\${m}`)
}
