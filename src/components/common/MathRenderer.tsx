import { useMemo, useEffect, useRef } from 'react'
import { isFileLikeImageRef } from '../../lib/questionImageUtils'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import { prepareLatexContent, repairLatexSnippet } from '../../lib/ocrContentNormalize'

const FORMULA_PLACEHOLDER = '【公式】'

interface MathRendererProps {
  /** 包含 $...$ 或 $$...$$ 的混合文本 */
  text: string
  /** 额外 CSS 类名 */
  className?: string
  /** 块级公式是否使用 displayMode */
  displayMode?: boolean
  /** 与 【公式】 占位符按序对应的 LaTeX 片段 */
  latexBlocks?: string[]
}

function applyLatexBlocks(text: string, latexBlocks: string[] = []): string {
  if (!latexBlocks.length || !text.includes(FORMULA_PLACEHOLDER)) return text
  let blockIdx = 0
  return text.replace(new RegExp(FORMULA_PLACEHOLDER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), () => {
    const latex = latexBlocks[blockIdx]?.trim()
    blockIdx += 1
    if (latex) return latex.includes('$') ? latex : `$${latex}$`
    return FORMULA_PLACEHOLDER
  })
}

export interface MathRenderStats {
  totalFormulas: number
  renderedFormulas: number
  placeholderCount: number
  hasUnrendered: boolean
  rawDollarCount: number
}

/** 分析文本中公式渲染情况（批量拆题等场景） */
export function analyzeMathContent(text: string, latexBlocks: string[] = []): MathRenderStats {
  const raw = String(text ?? '')
  const prepared = applyLatexBlocks(prepareLatexContent(raw), latexBlocks)
  const inlineCount = (prepared.match(/\$(?!\$)[^$\n]+?\$/g) || []).length
  const blockCount = (prepared.match(/\$\$[\s\S]*?\$\$/g) || []).length / 1
  const placeholderCount = (raw.match(/【公式】/g) || []).length
  const renderedFormulas = inlineCount + Math.floor((prepared.match(/\$\$/g) || []).length / 2)
  const rawDollarCount =
    (raw.match(/\$\$[\s\S]*?\$\$|\$[^$\n]+?\$/g) || []).length + placeholderCount
  const hasUnrendered =
    placeholderCount > latexBlocks.filter(Boolean).length ||
    /\$\$|\$[^$\s]|\\frac|\\sqrt|【公式】/.test(raw.replace(/\$\$[\s\S]*?\$\$|\$[^$\n]+?\$/g, ''))

  return {
    totalFormulas: renderedFormulas + Math.max(0, placeholderCount - latexBlocks.filter(Boolean).length),
    renderedFormulas,
    placeholderCount,
    hasUnrendered,
    rawDollarCount,
  }
}

/**
 * 将包含 LaTeX 公式的文本渲染为 HTML
 * - 行内公式: $...$ → 行内渲染
 * - 块级公式: $$...$$ → 独立行渲染
 * - 同时处理 \(...\) 和 \[...\] 语法
 */
export function renderLatexText(text: string, blockDisplay = true, latexBlocks: string[] = []): string {
  if (!text) return ''

  let processed = applyLatexBlocks(prepareLatexContent(String(text ?? '')), latexBlocks)

  // 先处理块级公式 $$...$$
  const parts: string[] = []
  let remaining = processed
  const blockRegex = /\$\$([\s\S]*?)\$\$/g

  let lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = blockRegex.exec(remaining)) !== null) {
    const before = remaining.slice(lastIndex, match.index)
    if (before) parts.push(renderInlineLatex(before))
    const latex = repairLatexSnippet(match[1])
    if (latex) {
      try {
        parts.push(
          katex.renderToString(latex, {
            displayMode: blockDisplay,
            throwOnError: false,
            trust: true,
            strict: 'ignore',
          }),
        )
      } catch {
        parts.push(`<span class="text-red-400 text-sm">[公式渲染失败]</span>`)
      }
    }
    lastIndex = match.index + match[0].length
  }

  const after = remaining.slice(lastIndex)
  if (after) parts.push(renderInlineLatex(after))

  return parts.join('')
}

function renderInlineLatex(text: string): string {
  if (!text) return ''

  const parts: string[] = []
  let remaining = text
  const inlineRegex = /\$([^$]+)\$/g

  let lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = inlineRegex.exec(remaining)) !== null) {
    const before = remaining.slice(lastIndex, match.index)
    if (before) {
      parts.push(renderPlaceholdersAndHtml(before))
    }
    const latex = repairLatexSnippet(match[1].trim())
    if (latex) {
      try {
        parts.push(
          katex.renderToString(latex, {
            displayMode: false,
            throwOnError: false,
            trust: true,
            strict: 'ignore',
          }),
        )
      } catch {
        parts.push(`<span class="text-red-400 text-sm">[公式错误]</span>`)
      }
    }
    lastIndex = match.index + match[0].length
  }

  const after = remaining.slice(lastIndex)
  if (after) {
    parts.push(renderPlaceholdersAndHtml(after))
  }

  return parts.join('')
}

const FORMULA_PENDING = '【公式待补】'
const IMAGE_PLACEHOLDER = '[图片占位符]'

function placeholderBadge(label: string, color: 'amber' | 'sky' = 'amber') {
  const cls = color === 'sky'
    ? 'inline-flex rounded border border-sky-400/40 bg-sky-400/10 px-1.5 py-0.5 text-xs text-sky-200'
    : 'inline-flex rounded border border-amber-400/50 bg-amber-400/15 px-1.5 py-0.5 text-xs text-amber-200'
  return `<span class="${cls}">${label}</span>`
}

function figureImgFromRef(refName: string): string {
  const name = refName.trim()
  const src = `/api/teacher/question-images?name=${encodeURIComponent(name)}`
  const alt = name.replace(/"/g, '&quot;')
  return `<img src="${src}" alt="${alt}" class="question-figure" loading="lazy" style="display:block;max-width:100%;height:auto;margin:8px 0;border-radius:4px;" />`
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '<br/>')
}

const PLACEHOLDER_TOKEN_RE =
  /【公式待补】|【公式】|【嵌入图形】|\[图片占位符\]|\[附图:\s*([^\]]+)\]|【图片】|【图片占位符】/gi

/**
 * 渲染含 HTML 标签的文本（img 等保留标签直接输出，其余转义）
 * 带缓存：相同文本不重复解析
 */
const htmlTagCache = new Map<string, string>()

function renderPlaceholdersAndHtml(text: string): string {
  if (!text) return ''

  const parts: string[] = []
  let last = 0
  let m: RegExpExecArray | null
  PLACEHOLDER_TOKEN_RE.lastIndex = 0
  while ((m = PLACEHOLDER_TOKEN_RE.exec(text)) !== null) {
    if (m.index > last) parts.push(renderWithHtmlTags(text.slice(last, m.index)))
    const token = m[0]
    if (token.startsWith('<img')) parts.push(token)
    else if (token.startsWith('[附图')) {
      const refMatch = /\[附图:\s*([^\]]+)\]/.exec(token)
      const refName = refMatch?.[1]?.trim() || ''
      if (refName && isFileLikeImageRef(refName)) {
        parts.push(figureImgFromRef(refName))
      } else if (refName) {
        parts.push(placeholderBadge('需配图', 'sky'))
      } else {
        parts.push(placeholderBadge('附图', 'sky'))
      }
    }
    else if (token.includes('图片') || token === '【嵌入图形】') parts.push(placeholderBadge('图形', 'sky'))
    else if (token === '【公式待补】') parts.push(placeholderBadge('公式待补', 'amber'))
    else parts.push(placeholderBadge('公式', 'amber'))
    last = m.index + token.length
  }
  if (last < text.length) parts.push(renderWithHtmlTags(text.slice(last)))
  return parts.join('')
}

function renderWithHtmlTags(text: string): string {
  if (!/<img\b[\s\S]*?\/?>|<br\s*\/?>|<hr\s*\/?>|<span\s[^>]*>/.test(text)) {
    return escapeHtml(text)
  }

  // 缓存检查
  if (htmlTagCache.has(text)) {
    return htmlTagCache.get(text)!
  }

  // 防止缓存过大
  if (htmlTagCache.size > 500) {
    const iter = htmlTagCache.keys()
    for (let i = 0; i < 200; i++) {
      htmlTagCache.delete(iter.next().value!)
    }
  }

  const parts: string[] = []
  let remaining = text
  const tagRegex = /(<img\b[\s\S]*?\/?>|<span\b[^>]*>[\s\S]*?<\/span>|<br\b[^>]*\/?>|<hr\b[^>]*\/?>)/gi
  let lastIndex = 0
  let match: RegExpExecArray | null

  tagRegex.lastIndex = 0

  while ((match = tagRegex.exec(remaining)) !== null) {
    const before = remaining.slice(lastIndex, match.index)
    if (before) parts.push(escapeHtml(before))
    const tag = match[1]
    if (/^<img\b/i.test(tag) && /src=["']data:image\/x-(?:wmf|emf)/i.test(tag)) {
      const b64Match = tag.match(/src=["']data:image\/x-(wmf|emf);base64,([^"']+)["']/i)
      const fmt = b64Match?.[1] || 'wmf'
      const b64 = b64Match?.[2] || ''
      const alt = /alt=["']公式["']/i.test(tag) ? '公式' : '图形'
      parts.push(
        `<img class="book-formula-img book-wmf-pending" data-wmf-fmt="${fmt}" data-wmf-b64="${b64}" src="" alt="${alt}" style="display:inline-block;vertical-align:middle;max-height:2em;max-width:100%;opacity:0;width:0;height:0;" />`,
      )
    } else {
      parts.push(tag)
    }
    lastIndex = match.index + match[0].length
  }

  const after = remaining.slice(lastIndex)
  if (after) parts.push(escapeHtml(after))

  const result = parts.join('')
  htmlTagCache.set(text, result)
  return result
}

/**
 * 在已有 HTML 中仅对文本节点渲染 LaTeX，保留段落/表格等标签结构
 * （勿对整段 HTML 调用 renderLatexText，否则会转义标签）
 */
export function renderLatexInHtml(html: string, blockDisplay = true, latexBlocks: string[] = []): string {
  if (!html) return ''
  if (!html.includes('$') && !html.includes(FORMULA_PLACEHOLDER) && !latexBlocks.length) return html

  const doc = new DOMParser().parseFromString(`<div data-math-root>${html}</div>`, 'text/html')
  const root = doc.querySelector('[data-math-root]')
  if (!root) return html

  const textNodes: Text[] = []
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let node: Node | null
  while ((node = walker.nextNode())) {
    const val = node.nodeValue || ''
    if (val.includes('$') || val.includes(FORMULA_PLACEHOLDER)) {
      textNodes.push(node as Text)
    }
  }

  for (const textNode of textNodes) {
    const original = textNode.nodeValue || ''
    const rendered = renderLatexText(original, blockDisplay, latexBlocks)
    if (rendered === original) continue
    const template = doc.createElement('template')
    template.innerHTML = rendered
    textNode.parentNode?.replaceChild(template.content, textNode)
  }

  return root.innerHTML
}

export default function MathRenderer({
  text,
  className = '',
  displayMode = true,
  latexBlocks = [],
}: MathRendererProps) {
  const html = useMemo(
    () => renderLatexText(text, displayMode, latexBlocks),
    [text, displayMode, latexBlocks],
  )
  const containerRef = useRef<HTMLSpanElement>(null)

  // WMF/EMF 公式图：尝试转为 PNG 显示；失败则保留原标签
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const formulaImgs = container.querySelectorAll<HTMLImageElement>(
      'img.book-formula-img, img.paper-docx-formula, img.book-wmf-pending, img[src*="image/x-wmf"], img[src*="image/x-emf"]',
    )
    const allImgs = container.querySelectorAll<HTMLImageElement>('img')
    allImgs.forEach((img) => {
      img.style.maxWidth = '100%'
      img.style.height = 'auto'
      img.style.verticalAlign = 'middle'
    })

    let cancelled = false

    const convertWmfImg = async (img: HTMLImageElement) => {
      let src = img.getAttribute('src') || ''
      let b64 = ''
      let fmt = 'wmf'

      const pendingB64 = img.getAttribute('data-wmf-b64')
      if (pendingB64) {
        b64 = pendingB64
        fmt = img.getAttribute('data-wmf-fmt') || 'wmf'
      } else if (/image\/x-(?:wmf|emf)/i.test(src)) {
        const dataMatch = src.match(/^data:image\/x-(wmf|emf);base64,(.+)$/i)
        if (!dataMatch) return
        fmt = dataMatch[1]
        b64 = dataMatch[2]
      } else {
        if (img.complete && img.naturalWidth === 0 && src) {
          img.style.display = 'none'
        }
        return
      }

      try {
        const { wmfEmfBase64ToPngDataUrl } = await import('../../lib/docxWmfConvert')
        const png = await wmfEmfBase64ToPngDataUrl(b64, fmt, 800)
        if (!cancelled && png) {
          img.src = png
          img.removeAttribute('data-wmf-b64')
          img.removeAttribute('data-wmf-fmt')
          img.classList.remove('book-wmf-pending')
          img.style.opacity = '1'
          img.style.width = ''
          img.style.height = ''
        }
      } catch {
        /* 转换失败时由下方 error 处理 */
      }
    }

    formulaImgs.forEach((img) => {
      void convertWmfImg(img)

      const handleError = () => {
        if (img.naturalWidth > 0) return
        const idx = img.getAttribute('data-formula-idx') || '?'
        const span = document.createElement('span')
        span.className =
          'inline-flex items-center justify-center px-1.5 py-0.5 mx-0.5 rounded bg-amber-100 text-amber-800 text-xs font-medium border border-amber-300'
        span.textContent = `F${idx}`
        span.title = `公式 #${idx}（WMF 暂无法显示）`
        img.replaceWith(span)
      }

      if (img.complete && img.naturalWidth === 0 && (img.getAttribute('data-wmf-b64') || /wmf|emf/i.test(img.src))) {
        void convertWmfImg(img).then(() => {
          if (img.naturalWidth === 0 && !img.getAttribute('data-wmf-b64')) handleError()
        })
      } else if (img.getAttribute('data-wmf-b64')) {
        void convertWmfImg(img).then(() => {
          if (img.naturalWidth === 0) handleError()
        })
      } else {
        img.addEventListener('error', handleError, { once: true })
      }
    })

    return () => {
      cancelled = true
    }
  }, [html])

  return (
    <span
      ref={containerRef}
      className={`math-renderer ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

/**
 * 纯 LaTeX 公式渲染（无混合文本）
 */
export function KatexFormula({ latex, block = true }: { latex: string; block?: boolean }) {
  const html = useMemo(() => {
    if (!latex) return ''
    try {
      return katex.renderToString(repairLatexSnippet(latex.trim()), {
        displayMode: block,
        throwOnError: false,
        trust: true,
        strict: 'ignore',
      })
    } catch {
      return `<span class="text-red-400 text-sm">[公式渲染失败]</span>`
    }
  }, [latex, block])

  return <span dangerouslySetInnerHTML={{ __html: html }} />
}
