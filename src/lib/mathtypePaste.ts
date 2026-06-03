/**
 * MathType / Word 公式粘贴：从剪贴板 HTML 提取 MathML 并转为 LaTeX。
 * npm 无 mathtype-to-latex 包，使用 mathml-to-latex（MathType 剪贴板多为 MathML）。
 */
import { MathMLToLaTeX } from 'mathml-to-latex'

const MATHML_NS = 'http://www.w3.org/1998/Math/MathML'

function wrapLatex(latex: string, display: boolean): string {
  const trimmed = latex.trim()
  if (!trimmed) return ''
  if (trimmed.startsWith('$$') && trimmed.endsWith('$$')) return trimmed
  if (trimmed.startsWith('$') && trimmed.endsWith('$') && !trimmed.startsWith('$$')) return trimmed
  return display ? `$$${trimmed}$$` : `$${trimmed}$`
}

function isBlockMath(el: Element): boolean {
  const display = el.getAttribute('display') ?? el.getAttribute('data-display')
  if (display === 'block') return true
  const parent = el.parentElement
  if (parent?.tagName.toLowerCase() === 'div' && /display|equation/i.test(parent.className)) return true
  return false
}

function convertMathElement(el: Element): string | null {
  try {
    const serializer = new XMLSerializer()
    let mathml = serializer.serializeToString(el)
    if (!mathml.includes('xmlns')) {
      mathml = mathml.replace(/<math\b/, `<math xmlns="${MATHML_NS}"`)
    }
    const latex = MathMLToLaTeX.convert(mathml)
    return latex ? wrapLatex(latex, isBlockMath(el)) : null
  } catch {
    return null
  }
}

function extractMathElementsFromDoc(doc: Document): Element[] {
  const found: Element[] = []
  doc.querySelectorAll('math').forEach((m) => found.push(m))
  doc.querySelectorAll('[data-mathml]').forEach((el) => {
    const raw = el.getAttribute('data-mathml')
    if (!raw) return
    try {
      const parsed = new DOMParser().parseFromString(raw, 'text/xml')
      const math = parsed.querySelector('math')
      if (math) found.push(math)
    } catch {
      /* ignore */
    }
  })
  return found
}

function extractMathMLFromHtml(html: string): string[] {
  if (!html?.trim()) return []
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const elements = extractMathElementsFromDoc(doc)
  const results: string[] = []
  for (const el of elements) {
    const converted = convertMathElement(el)
    if (converted) results.push(converted)
  }
  if (results.length > 0) return results

  const mathmlMatch = html.match(/<math[\s\S]*?<\/math>/gi)
  if (!mathmlMatch) return []
  for (const fragment of mathmlMatch) {
    try {
      const parsed = new DOMParser().parseFromString(fragment, 'text/xml')
      const math = parsed.querySelector('math')
      if (math) {
        const converted = convertMathElement(math)
        if (converted) results.push(converted)
      }
    } catch {
      /* ignore */
    }
  }
  return results
}

/** 从剪贴板 HTML / 纯文本检测并转换 MathType(MathML) 为 LaTeX 片段 */
export function extractLatexFromClipboard(html: string | null | undefined, plain?: string | null): string[] {
  const fromHtml = html ? extractMathMLFromHtml(html) : []
  if (fromHtml.length > 0) return fromHtml

  if (plain && /<math[\s\S]*?<\/math>/i.test(plain)) {
    return extractMathMLFromHtml(plain)
  }
  return []
}

export function joinLatexParts(parts: string[]): string {
  return parts.filter(Boolean).join('\n')
}
