import { useMemo } from 'react'
import TeX from '@matejmazur/react-katex'
import 'katex/dist/katex.min.css'

const IMAGE_PLACEHOLDER = '[图片占位符]'

const KATEX_SETTINGS = {
  throwOnError: false,
  trust: true,
  strict: false,
} as const

/** 将块级公式 $$...$$ 独立成段，便于正确识别 */
export function normalizeBlockMath(text: string): string {
  return text.replace(/\$\$([\s\S]*?)\$\$/g, (_, inner) => `\n$$${inner.trim()}$$\n`)
}

function normalizeDollars(text: string): string {
  return text.replace(/\uFF04/g, '$')
}

/** 统一 \(...\) / \[...\] 为 $ / $$ 语法 */
function normalizeLatexDelimiters(text: string): string {
  return text
    .replace(/\\\(([\s\S]*?)\\\)/g, (_, inner) => `$${inner.trim()}$`)
    .replace(/\\\[([\s\S]*?)\\\]/g, (_, inner) => `$$${inner.trim()}$$`)
}

function isEscaped(s: string, idx: number): boolean {
  let bs = 0
  for (let i = idx - 1; i >= 0 && s[i] === '\\'; i--) bs++
  return bs % 2 === 1
}

/** 为未包裹 $ 的裸 LaTeX 命令自动加定界符（跳过 $$...$$ 与 $...$ 内部） */
function wrapBareLatex(text: string): string {
  const bareRe =
    /\\(?:frac|sqrt|sum|int|prod|lim|sin|cos|tan|log|ln|pi|alpha|beta|gamma|theta|Delta|Omega|vec|overline|underline|left|right|begin|text|mathrm|mathbf|mathit|displaystyle|limits|cdot|times|div|pm|mp|leq|geq|neq|approx|infty|partial|nabla|forall|exists|in|notin|subset|supset|cup|cap|rightarrow|leftarrow|Rightarrow|Leftarrow|Leftrightarrow|ldots|cdots|vdots|ddots)\b(?:\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\})*(?:_\{[^{}]*\}|\^\{[^{}]*\})*(?:_\w|\^\w)*/g

  let result = ''
  let cursor = 0
  let inInline = false
  let inBlock = false

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
  const normalized = normalizeDollars(text.replace(/\\\\/g, '\\'))
  return wrapBareLatex(normalizeBlockMath(normalizeLatexDelimiters(normalized)))
}

type Segment =
  | { kind: 'text'; value: string }
  | { kind: 'inline'; value: string }
  | { kind: 'block'; value: string }
  | { kind: 'image' }

function findClosingDoubleDollar(s: string, from: number): number {
  for (let i = from; i < s.length - 1; i++) {
    if (s[i] === '$' && s[i + 1] === '$' && !isEscaped(s, i)) {
      return i
    }
  }
  return -1
}

function findClosingSingleDollar(s: string, from: number): number {
  for (let i = from; i < s.length; i++) {
    if (s[i] === '$' && !isEscaped(s, i)) {
      return i
    }
  }
  return -1
}

/**
 * 单次扫描分词：优先匹配 $$...$$ 块级公式，再匹配 $...$ 行内公式
 */
function tokenizeMathText(text: string): Segment[] {
  const segments: Segment[] = []
  let i = 0

  while (i < text.length) {
    if (text.startsWith(IMAGE_PLACEHOLDER, i)) {
      segments.push({ kind: 'image' })
      i += IMAGE_PLACEHOLDER.length
      continue
    }

    // 1. 块级公式 $$...$$（必须在行内 $...$ 之前判断）
    if (text[i] === '$' && text[i + 1] === '$' && !isEscaped(text, i)) {
      const close = findClosingDoubleDollar(text, i + 2)
      if (close !== -1) {
        const formula = text.slice(i + 2, close).trim()
        if (formula) {
          segments.push({ kind: 'block', value: formula })
        }
        i = close + 2
        continue
      }
    }

    // 2. 行内公式 $...$
    if (text[i] === '$' && !isEscaped(text, i) && text[i + 1] !== '$') {
      const close = findClosingSingleDollar(text, i + 1)
      if (close !== -1) {
        const formula = text.slice(i + 1, close).trim()
        if (formula) {
          segments.push({ kind: 'inline', value: formula })
        }
        i = close + 1
        continue
      }
    }

    // 3. 普通文本，直到下一个特殊标记
    let j = i + 1
    while (j < text.length) {
      if (text.startsWith(IMAGE_PLACEHOLDER, j)) break
      if (text[j] === '$' && !isEscaped(text, j)) break
      j++
    }
    const plain = text.slice(i, j)
    if (plain) {
      segments.push({ kind: 'text', value: plain })
    }
    i = j
  }

  return segments
}

function parseSegments(text: string): Segment[] {
  return tokenizeMathText(preprocessText(text))
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
            <TeX
              key={`block-${idx}`}
              block
              math={seg.value}
              className="my-2 block w-full overflow-x-auto text-center"
              settings={KATEX_SETTINGS}
            />
          )
        }
        if (seg.kind === 'inline') {
          return (
            <TeX
              key={`inline-${idx}`}
              math={seg.value}
              className="mx-0.5 inline align-baseline"
              settings={KATEX_SETTINGS}
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
