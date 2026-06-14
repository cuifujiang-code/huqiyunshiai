/**
 * 入库前内容清洗：WMF/EMF 公式图 → LaTeX，去除浏览器无法显示的 data URL
 */
import { callDeepSeekVisionAI } from '../deepseekClient.js'
import { cleanFormula, extractLatexBlocks } from './questionNormalizer.js'

const WMF_IMG_TAG_RE = /<img\b[^>]*\bsrc=["']data:image\/x-(?:wmf|emf);base64,([^"']+)["'][^>]*\/?>/gi
const FORMULA_PLACEHOLDER_RE = /【公式】|【公式待补】/g
const UNSUPPORTED_FORMULA_IMG_RE = /<img\b[^>]*\bsrc=["']data:image\/x-(?:wmf|emf);base64,[^"']+["'][^>]*\/?>/gi

function wrapLatex(latex) {
  const s = String(latex ?? '').trim()
  if (!s) return ''
  if (s.includes('$')) return s
  return `$${s}$`
}

async function visionLatexFromBase64(b64, mime = 'image/png') {
  if (!b64) return null
  try {
    const raw = await callDeepSeekVisionAI(
      '你是数学公式识别专家。根据图片输出标准 LaTeX，不要 $ 分隔符，不要解释。',
      '识别图中的数学公式，只输出 LaTeX。',
      b64,
      mime,
      { temperature: 0.1 },
    )
    const latex = cleanFormula(String(raw ?? '')).replace(/^\$\$?|\$\$?$/g, '').trim()
    return latex || null
  } catch (err) {
    console.warn('[contentSanitizer] 公式视觉识别失败', {
      message: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}

/** 将文本中的 WMF/EMF <img> 替换为 LaTeX（逐张识别） */
export async function replaceUnsupportedFormulaImages(text) {
  if (!text || !UNSUPPORTED_FORMULA_IMG_RE.test(text)) {
    return { text, replaced: 0 }
  }
  UNSUPPORTED_FORMULA_IMG_RE.lastIndex = 0

  let replaced = 0
  let idx = 0
  const out = []

  let last = 0
  let match
  while ((match = WMF_IMG_TAG_RE.exec(text)) !== null) {
    out.push(text.slice(last, match.index))
    const b64 = match[1]
    const latex = await visionLatexFromBase64(b64, 'image/x-wmf')
    if (latex) {
      out.push(wrapLatex(latex))
      replaced++
    } else {
      out.push('【公式待补】')
    }
    last = match.index + match[0].length
    idx++
    if (idx >= 30) break
  }
  out.push(text.slice(last))

  return { text: out.join(''), replaced }
}

export function contentNeedsSanitize(text) {
  if (!text) return false
  return UNSUPPORTED_FORMULA_IMG_RE.test(text)
    || FORMULA_PLACEHOLDER_RE.test(text)
    || /\[图片占位符\]/.test(text)
}

/** 解析字段：仅保留 Markdown/LaTeX，移除图片链接 */
export function sanitizeAnalysisText(raw) {
  let s = String(raw ?? '').trim()
  if (!s) return ''
  s = s.replace(/<img\b[^>]*\/?>/gi, '[图片已移除，请改用 LaTeX/Markdown 描述]')
  s = s.replace(/!\[[^\]]*\]\([^)]+\)/g, '[图片已移除，请改用 LaTeX/Markdown 描述]')
  return s
}

/** 单题入库前清洗 */
export async function sanitizeQuestionForStorage(q) {
  if (!q || typeof q !== 'object') return q

  let content = String(q.content ?? '')
  let answer = String(q.answer ?? '')
  let analysis = sanitizeAnalysisText(String(q.analysis ?? ''))

  for (const field of ['content', 'answer', 'analysis']) {
    const val = field === 'content' ? content : field === 'answer' ? answer : analysis
    if (!contentNeedsSanitize(val) && !UNSUPPORTED_FORMULA_IMG_RE.test(val)) continue

    const { text, replaced } = await replaceUnsupportedFormulaImages(val)
    if (field === 'content') content = text
    else if (field === 'answer') answer = text
    else analysis = text

    if (replaced > 0) {
      console.log('[contentSanitizer] WMF→LaTeX', { field, replaced })
    }
  }

  const latex_blocks = [
    ...new Set([
      ...(Array.isArray(q.latex_blocks) ? q.latex_blocks : []),
      ...extractLatexBlocks(content),
      ...extractLatexBlocks(answer),
      ...extractLatexBlocks(analysis),
    ]),
  ]

  const tags = (Array.isArray(q.tags) ? q.tags : []).filter(
    (t) => !String(t).includes('含公式占位符') || !/【公式】|【公式待补】/.test(content),
  )

  return {
    ...q,
    content,
    answer,
    analysis,
    latex_blocks,
    tags,
  }
}

export async function sanitizeQuestionsForStorage(questions) {
  const list = Array.isArray(questions) ? questions : []
  const out = []
  for (const q of list) {
    out.push(await sanitizeQuestionForStorage(q))
  }
  return out
}
