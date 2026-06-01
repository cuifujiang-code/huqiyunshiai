import { useMemo } from 'react'
import katex from 'katex'

const IMAGE_PLACEHOLDER = '[图片占位符]'

/** 将块级公式 $$...$$ 独立成段，便于正确识别 */
export function normalizeBlockMath(text: string): string {
  return text.replace(/\$\$([\s\S]*?)\$\$/g, (_, inner) => `\n$$${inner.trim()}$$\n`)
}

/** 统一 \(...\) / \[...\] 为 $ / $$ 语法 */
function normalizeLatexDelimiters(text: string): string {
  return text
    .replace(/\\\(([\s\S]*?)\\\)/g, (_, inner) => `$${inner.trim()}$`)
    .replace(/\\\[([\s\S]*?)\\\]/g, (_, inner) => `$$${inner.trim()}$$`)
}

/** 为未包裹 $ 的裸 LaTeX 命令自动加定界符 */
function wrapBareLatex(text: string): string {
  const bareRe =
    /\\(?:frac|sqrt|sum|int|prod|lim|sin|cos|tan|log|ln|pi|alpha|beta|gamma|theta|Delta|Omega|vec|overline|underline|left|right|begin|text|mathrm|mathbf|mathit|displaystyle|limits|cdot|times|div|pm|mp|leq|geq|neq|approx|infty|partial|nabla|forall|exists|in|notin|subset|supset|cup|cap|rightarrow|leftarrow|Rightarrow|Leftarrow|Leftrightarrow|ldots|cdots|vdots|ddots)\b(?:\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\})*(?:_\{[^{}]*\}|\^\{[^{}]*\})*(?:_\w|\^\w)*/g

  let result = ''
  let cursor = 0
  let inInline = false
  let inBlock = false

  const isEscaped = (s: string, idx: number) => {
    let bs = 0
    for (let i = idx - 1; i >= 0 && s[i] === '\\'; i--) bs++
    return bs % 2 === 1
  }

  while (cursor < text.length) {
    if (!inInline && !inBlock && text.startsWith('$$', cursor) && !isEscaped(text, cursor)) {
      inBlock = true
      result += '$$'
      cursor += 2
      continue
    }
    if (inBlock && text.startsWith('$$', cursor) && !isEscaped(text, cursor)) {
      inBlock = false
      result += '$$'
      cursor += 2
      continue
    }
    if (!inInline && !inBlock && text[cursor] === '$' && !isEscaped(text, cursor)) {
      inInline = true
      result += '$'
      cursor += 1
      continue
    }
    if (inInline && text[cursor] === '$' && !isEscaped(text, cursor)) {
      inInline = false
      result += '$'
      cursor += 1
      continue
    }

    if (!inInline && !inBlock) {
      bareRe.lastIndex = cursor
      const match = bareRe.exec(text)
      if (match && match.index === cursor) {
        result += `$${match[0]}$`
        cursor += match[0].length
        continue
      }
    }

    result += text[cursor]
    cursor += 1
  }

  return result
}

function preprocessText(text: string): string {
  if (!text) return ''
  return wrapBareLatex(normalizeBlockMath(normalizeLatexDelimiters(text.replace(/\\\\/g, '\\'))))
}

type Segment =
  | { kind: 'text'; value: string }
  | { kind: 'inline'; value: string }
  | { kind: 'block'; value: string }
  | { kind: 'image' }

function parseSegments(text: string): Segment[] {
  const processed = preprocessText(text)
  const segments: Segment[] = []

  const chunks = processed.split(/(\[图片占位符\])/g)
  for (const chunk of chunks) {
    if (chunk === IMAGE_PLACEHOLDER) {
      segments.push({ kind: 'image' })
      continue
    }
    if (!chunk) continue

    let remaining = chunk
    while (remaining.length > 0) {
      const blockMatch = remaining.match(/^\$\$([\s\S]*?)\$\$/)
      if (blockMatch) {
        segments.push({ kind: 'block', value: blockMatch[1].trim() })
        remaining = remaining.slice(blockMatch[0].length)
        continue
      }

      const inlineMatch = remaining.match(/^\$([^$\n]+?)\$/)
      if (inlineMatch) {
        segments.push({ kind: 'inline', value: inlineMatch[1].trim() })
        remaining = remaining.slice(inlineMatch[0].length)
        continue
      }

      const nextSpecial = remaining.search(/\$\$|\$|\[图片占位符\]/)
      const end = nextSpecial === -1 ? remaining.length : nextSpecial
      const plain = remaining.slice(0, end)
      if (plain) segments.push({ kind: 'text', value: plain })
      remaining = remaining.slice(end)
    }
  }

  return segments
}

function renderKatexHtml(latex: string, displayMode: boolean): string {
  try {
    return katex.renderToString(latex, {
      displayMode,
      throwOnError: false,
      trust: true,
      strict: false,
    })
  } catch {
    return displayMode ? `$$${latex}$$` : `$${latex}$`
  }
}

function ImagePlaceholderCard() {
  return (
    <div
      className="my-2 inline-flex w-full items-center gap-2 rounded-lg border border-amber-400/60 bg-amber-400/20 px-3 py-2"
      role="note"
    >
      <svg
        className="h-4 w-4 shrink-0 text-amber-300"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
        aria-hidden
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
        />
      </svg>
      <span className="text-sm font-medium text-amber-100">图片待补充</span>
    </div>
  )
}

export interface QuestionContentProps {
  /** 题目 content / answer / analysis 等混合文本 */
  text: string
  className?: string
}

export default function QuestionContent({ text, className = '' }: QuestionContentProps) {
  const segments = useMemo(() => parseSegments(text ?? ''), [text])

  if (!text?.trim()) return null

  return (
    <div className={`question-content ${className}`.trim()}>
      {segments.map((seg, idx) => {
        if (seg.kind === 'image') {
          return <ImagePlaceholderCard key={`img-${idx}`} />
        }
        if (seg.kind === 'block') {
          return (
            <div
              key={`block-${idx}`}
              className="my-2 overflow-x-auto"
              dangerouslySetInnerHTML={{ __html: renderKatexHtml(seg.value, true) }}
            />
          )
        }
        if (seg.kind === 'inline') {
          return (
            <span
              key={`inline-${idx}`}
              className="mx-0.5 inline align-baseline"
              dangerouslySetInnerHTML={{ __html: renderKatexHtml(seg.value, false) }}
            />
          )
        }
        return (
          <span key={`text-${idx}`} className="whitespace-pre-wrap">
            {seg.value}
          </span>
        )
      })}
    </div>
  )
}
