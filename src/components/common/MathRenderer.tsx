import { useMemo, useEffect, useRef } from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'

interface MathRendererProps {
  /** 包含 $...$ 或 $$...$$ 的混合文本 */
  text: string
  /** 额外 CSS 类名 */
  className?: string
  /** 块级公式是否使用 displayMode */
  displayMode?: boolean
}

/**
 * 将包含 LaTeX 公式的文本渲染为 HTML
 * - 行内公式: $...$ → 行内渲染
 * - 块级公式: $$...$$ → 独立行渲染
 * - 同时处理 \(...\) 和 \[...\] 语法
 */
function renderLatexText(text: string, blockDisplay = true): string {
  if (!text) return ''

  // 统一转义反斜杠问题
  let processed = text
    .replace(/\\\\/g, '\\')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, ' ')

  // 统一 \(...\) → $...$ 和 \[...\] → $$...$$
  processed = processed.replace(/\\\(([\s\S]*?)\\\)/g, (_, inner) => `$${inner.trim()}$`)
  processed = processed.replace(/\\\[([\s\S]*?)\\\]/g, (_, inner) => `$$${inner.trim()}$$`)

  // 先处理块级公式 $$...$$
  const parts: string[] = []
  let remaining = processed
  const blockRegex = /\$\$([\s\S]*?)\$\$/g

  let lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = blockRegex.exec(remaining)) !== null) {
    // 前面的文本先处理行内公式
    const before = remaining.slice(lastIndex, match.index)
    if (before) {
      parts.push(renderInlineLatex(before))
    }
    // 块级公式
    const latex = match[1].trim()
    if (latex) {
      try {
        parts.push(
          katex.renderToString(latex, {
            displayMode: blockDisplay,
            throwOnError: false,
            trust: true,
          }),
        )
      } catch {
        parts.push(`<span class="text-red-400 text-sm">[公式渲染失败: ${escapeHtml(latex.slice(0, 30))}...]</span>`)
      }
    }
    lastIndex = match.index + match[0].length
  }

  // 剩余文本
  const after = remaining.slice(lastIndex)
  if (after) {
    parts.push(renderInlineLatex(after))
  }

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
      parts.push(renderWithHtmlTags(before))
    }
    const latex = match[1].trim()
    if (latex) {
      try {
        parts.push(
          katex.renderToString(latex, {
            displayMode: false,
            throwOnError: false,
            trust: true,
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
    parts.push(renderWithHtmlTags(after))
  }

  return parts.join('')
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '<br/>')
}

/**
 * 渲染含 HTML 标签的文本（img 等保留标签直接输出，其余转义）
 * 带缓存：相同文本不重复解析
 */
const htmlTagCache = new Map<string, string>()

function renderWithHtmlTags(text: string): string {
  if (!/<img\s[^>]*\/?>|<br\s*\/?>|<hr\s*\/?>/.test(text)) {
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
  // 优化正则：更精确地匹配自闭合标签
  const tagRegex = /(<img\b[^>]*\/?>|<br\b[^>]*\/?>|<hr\b[^>]*\/?>)/gi
  let lastIndex = 0
  let match: RegExpExecArray | null

  // 重置 lastIndex 避免 sticky 问题
  tagRegex.lastIndex = 0

  while ((match = tagRegex.exec(remaining)) !== null) {
    const before = remaining.slice(lastIndex, match.index)
    if (before) parts.push(escapeHtml(before))
    // 直接输出 HTML 标签（不做转义）
    parts.push(match[1])
    lastIndex = match.index + match[0].length
  }

  const after = remaining.slice(lastIndex)
  if (after) parts.push(escapeHtml(after))

  const result = parts.join('')
  htmlTagCache.set(text, result)
  return result
}

export default function MathRenderer({ text, className = '', displayMode = true }: MathRendererProps) {
  const html = useMemo(() => renderLatexText(text, displayMode), [text, displayMode])
  const containerRef = useRef<HTMLSpanElement>(null)

  // 处理 WMF 公式图片的 fallback：当浏览器不支持 image/x-wmf 时显示公式编号
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const wmfImgs = container.querySelectorAll<HTMLImageElement>('img[data-format="wmf"]')
    wmfImgs.forEach((img) => {
      // 如果图片已经加载成功（自然宽度 > 0），跳过
      if (img.naturalWidth > 0) return

      // 添加错误处理：WMF 加载失败时显示公式编号 fallback
      const handleError = () => {
        const idx = img.getAttribute('data-formula-idx') || '?'
        const span = document.createElement('span')
        span.className = 'inline-flex items-center justify-center px-1.5 py-0.5 mx-0.5 rounded bg-amber-100 text-amber-800 text-xs font-medium border border-amber-300 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700'
        span.textContent = `F${idx}`
        span.title = `公式 #${idx}（浏览器不支持 WMF 格式，请在预览中查看）`
        img.replaceWith(span)
      }

      // 如果已经加载失败（complete=true 且 naturalWidth=0）
      if (img.complete && img.naturalWidth === 0) {
        handleError()
      } else {
        img.addEventListener('error', handleError, { once: true })
      }
    })
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
      return katex.renderToString(latex.trim(), {
        displayMode: block,
        throwOnError: false,
        trust: true,
      })
    } catch {
      return `<span class="text-red-400 text-sm">[公式渲染失败]</span>`
    }
  }, [latex, block])

  return <span dangerouslySetInnerHTML={{ __html: html }} />
}
