import { useMemo } from 'react'
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
    // 前面的纯文本
    const before = remaining.slice(lastIndex, match.index)
    if (before) {
      parts.push(escapeHtml(before))
    }
    // 行内公式
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

  // 剩余纯文本
  const after = remaining.slice(lastIndex)
  if (after) {
    parts.push(escapeHtml(after))
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

export default function MathRenderer({ text, className = '', displayMode = true }: MathRendererProps) {
  const html = useMemo(() => renderLatexText(text, displayMode), [text, displayMode])

  return (
    <span
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
