/**
 * 拍照搜题 — 将无 $ 定界符的数学片段自动包裹为 KaTeX 可渲染格式
 */
import { normalizeLatexDelimiters, prepareLatexContent, repairMissingBackslashes } from './ocrContentNormalize'

const SUBSCRIPT_UNICODE: Record<string, string> = {
  '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4',
  '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9',
}

function normalizeMathSymbols(chunk: string): string {
  let s = chunk
  for (const [u, d] of Object.entries(SUBSCRIPT_UNICODE)) {
    s = s.replace(new RegExp(`([A-Za-z])${u}`, 'g'), `$1_${d}`)
  }
  s = s.replace(/×/g, '\\times ')
  s = s.replace(/÷/g, '\\div ')
  s = s.replace(/(?<![\\a-zA-Z])cdot(?![a-zA-Z])/g, '\\cdot ')
  s = repairMissingBackslashes(s)
  return s.replace(/\s{2,}/g, ' ').trim()
}

/** 判断片段是否像数学表达式（而非普通英文/数字） */
export function looksLikeMathSegment(text: string): boolean {
  const s = text.trim()
  if (s.length < 2) return false
  if (/^[\s\d.,，。、；：！？.]+$/.test(s)) return false
  if (/^https?:\/\//.test(s)) return false

  const chinese = (s.match(/[\u4e00-\u9fff]/g) || []).length
  if (chinese > 0 && chinese / s.length > 0.35) return false

  const indicators =
    (s.match(/\\[a-zA-Z]+|[_^]\{|[_^][0-9A-Za-z]|[A-Z]_\{|[A-Z]_[0-9A-Za-z]|[A-Z]\([A-Za-z]+\)|[=≈≤≥<>~]|\\frac|\\sum|\\sqrt|\\left|\\right|\d+\/\d+/g) || [])
      .length

  if (/\\(?:sum|frac|sqrt|begin|left|right|text|mathrm)/.test(s)) return true
  if (/[_^]\{/.test(s) || /[A-Z]_\{/.test(s) || /[A-Z]_[0-9A-Za-z]/.test(s)) return true
  if (/[A-Z]\([A-Z]{1,4}\)/.test(s)) return true
  if (/~\s*[A-Z(]/.test(s)) return true
  if (/[=≈]/.test(s) && indicators >= 2) return true
  if (indicators >= 4 && /[0-9]/.test(s) && /[A-Za-z_\\]/.test(s)) return true

  return false
}

function wrapSegment(segment: string): string {
  const trimmed = segment.trim()
  if (!trimmed || !looksLikeMathSegment(trimmed)) return segment

  const normalized = normalizeMathSymbols(trimmed)
  const useBlock = normalized.length > 100 || /\\begin\{|\\sum_|\\frac\{/.test(normalized)
  const wrapped = useBlock ? `$$${normalized}$$` : `$${normalized}$`

  const lead = segment.match(/^\s*/)?.[0] ?? ''
  const trail = segment.match(/\s*$/)?.[0] ?? ''
  return `${lead}${wrapped}${trail}`
}

/** 在非 $ 区域按「中文 / 非中文」切分并包裹数学片段 */
function wrapMathInPlainChunk(chunk: string): string {
  if (!chunk.trim()) return chunk

  return chunk.replace(/([^\u4e00-\u9fff]+)/g, (run) => {
    if (!run.trim()) return run
    if (run.includes('$')) return run

    const pieces = run.split(/(?<=[，。；])\s+/)
    if (pieces.length > 1) {
      return pieces.map((p) => wrapSegment(p)).join(' ')
    }
    return wrapSegment(run)
  })
}

/** 跳过已有 $...$ / $$...$$ 区域，只处理其余文本 */
function wrapUndelimitedMath(text: string): string {
  const out: string[] = []
  let i = 0

  while (i < text.length) {
    if (text.startsWith('$$', i)) {
      const end = text.indexOf('$$', i + 2)
      if (end === -1) {
        out.push(wrapMathInPlainChunk(text.slice(i)))
        break
      }
      out.push(text.slice(i, end + 2))
      i = end + 2
      continue
    }

    if (text[i] === '$') {
      const end = text.indexOf('$', i + 1)
      if (end === -1) {
        out.push(wrapMathInPlainChunk(text.slice(i)))
        break
      }
      out.push(text.slice(i, end + 1))
      i = end + 1
      continue
    }

    const next = text.indexOf('$', i)
    const plain = next === -1 ? text.slice(i) : text.slice(i, next)
    out.push(wrapMathInPlainChunk(plain))
    i = next === -1 ? text.length : next
  }

  return out.join('')
}

/** 拍照搜题专用：完整预处理后再渲染 */
export function preparePhotoSearchMath(text: string): string {
  if (!text?.trim()) return ''

  let s = String(text)
  s = normalizeLatexDelimiters(s)
  s = wrapUndelimitedMath(s)
  s = prepareLatexContent(s)

  if (!s.includes('$') && looksLikeMathSegment(s)) {
    const normalized = normalizeMathSymbols(s)
    s = normalized.length > 80 ? `$$${normalized}$$` : `$${normalized}$`
  }

  return s
}
