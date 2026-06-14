/** 解析字段：仅保留 Markdown/LaTeX 文本，移除图片链接与 HTML 图片标签 */

const IMG_TAG_RE = /<img\b[^>]*\/?>/gi
const MD_IMAGE_RE = /!\[[^\]]*\]\([^)]+\)/g

export function sanitizeAnalysisText(raw: string): string {
  let s = String(raw ?? '').trim()
  if (!s) return ''
  s = s.replace(IMG_TAG_RE, '[图片已移除，请改用 LaTeX/Markdown 描述]')
  s = s.replace(MD_IMAGE_RE, '[图片已移除，请改用 LaTeX/Markdown 描述]')
  return s
}

export function isAnalysisTextOnly(raw: string): boolean {
  const s = String(raw ?? '')
  return !IMG_TAG_RE.test(s) && !MD_IMAGE_RE.test(s)
}
