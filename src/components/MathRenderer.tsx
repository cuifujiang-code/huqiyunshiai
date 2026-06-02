import { useMemo } from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'

const FORMULA_PLACEHOLDER = '【公式】'
const IMAGE_PLACEHOLDER = '[图片占位符]'

const KATEX_OPTS = {
  throwOnError: false,
  trust: true,
  strict: false,
} as const

export interface MathRendererProps {
  text: string
  className?: string
  /** 与 content 中 【公式】 占位符按序对应的 LaTeX 片段 */
  latexBlocks?: string[]
}

type Part =
  | { kind: 'text'; value: string }
  | { kind: 'inline'; value: string }
  | { kind: 'block'; value: string }
  | { kind: 'html'; value: string }
  | { kind: 'formula-placeholder'; value: string }

export interface MathRenderStats {
  totalFormulas: number
  renderedFormulas: number
  placeholderCount: number
  hasUnrendered: boolean
  rawDollarCount: number
}

function normalizeDollars(text: string): string {
  return text.replace(/\uFF04/g, '$').replace(/&#36;/g, '$').replace(/&dollar;/gi, '$')
}

function prepareMathText(raw: string, latexBlocks: string[] = []): string {
  let t = normalizeDollars(String(raw ?? ''))
  t = t.replace(/\\\$/g, '$')
  t = t.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\r/g, '\r')
  t = t.replace(/\\\\/g, '\\')
  t = t.replace(/\\\[([\s\S]*?)\\\]/g, (_, inner) => `$$${inner.trim()}$$`)
  t = t.replace(/\\\(([\s\S]*?)\\\)/g, (_, inner) => `$${inner.trim()}$`)

  let blockIdx = 0
  t = t.replace(new RegExp(FORMULA_PLACEHOLDER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), () => {
    const latex = latexBlocks[blockIdx]?.trim()
    blockIdx += 1
    if (latex) {
      return latex.includes('$') ? latex : `$${latex}$`
    }
    return FORMULA_PLACEHOLDER
  })

  return t
}

function isEscaped(s: string, idx: number): boolean {
  let bs = 0
  for (let i = idx - 1; i >= 0 && s[i] === '\\'; i--) bs++
  return bs % 2 === 1
}

function findClosingDoubleDollar(s: string, from: number): number {
  for (let i = from; i < s.length - 1; i++) {
    if (s[i] === '$' && s[i + 1] === '$' && !isEscaped(s, i)) return i
  }
  return -1
}

function findClosingSingleDollar(s: string, from: number): number {
  for (let i = from; i < s.length; i++) {
    if (s[i] === '$' && !isEscaped(s, i)) return i
  }
  return -1
}

/** 单次扫描：优先 $$...$$，再 $...$ */
function scanMathParts(text: string): Part[] {
  const parts: Part[] = []
  let i = 0

  while (i < text.length) {
    if (text.startsWith(IMAGE_PLACEHOLDER, i)) {
      parts.push({ kind: 'text', value: IMAGE_PLACEHOLDER })
      i += IMAGE_PLACEHOLDER.length
      continue
    }

    if (text.startsWith(FORMULA_PLACEHOLDER, i)) {
      parts.push({ kind: 'formula-placeholder', value: FORMULA_PLACEHOLDER })
      i += FORMULA_PLACEHOLDER.length
      continue
    }

    if (text[i] === '$' && text[i + 1] === '$' && !isEscaped(text, i)) {
      const close = findClosingDoubleDollar(text, i + 2)
      if (close !== -1) {
        const formula = text.slice(i + 2, close).trim()
        if (formula) parts.push({ kind: 'block', value: formula })
        i = close + 2
        continue
      }
    }

    if (text[i] === '$' && !isEscaped(text, i) && text[i + 1] !== '$') {
      const close = findClosingSingleDollar(text, i + 1)
      if (close !== -1) {
        const formula = text.slice(i + 1, close).trim()
        if (formula) parts.push({ kind: 'inline', value: formula })
        i = close + 1
        continue
      }
    }

    const imgMatch = text.slice(i).match(/^<img\b[^>]*\/?>/i)
    if (imgMatch) {
      parts.push({ kind: 'html', value: imgMatch[0] })
      i += imgMatch[0].length
      continue
    }

    let j = i + 1
    while (j < text.length) {
      if (text.startsWith(IMAGE_PLACEHOLDER, j)) break
      if (text.startsWith(FORMULA_PLACEHOLDER, j)) break
      if (text[j] === '$' && !isEscaped(text, j)) break
      if (text.slice(j).match(/^<img\b/i)) break
      j++
    }
    const plain = text.slice(i, j)
    if (plain) parts.push({ kind: 'text', value: plain })
    i = j
  }

  return parts
}

/** 对仍含 $$ 的文本段做二次解析 */
function expandParts(parts: Part[]): Part[] {
  const expanded: Part[] = []
  for (const part of parts) {
    if (part.kind !== 'text' || !/\$\$[\s\S]*?\$\$|\$[^$\n]+?\$/.test(part.value)) {
      expanded.push(part)
      continue
    }
    expanded.push(...scanMathParts(part.value))
  }
  return expanded
}

export function parseMathParts(text: string, latexBlocks: string[] = []): Part[] {
  const prepared = prepareMathText(text, latexBlocks)
  if (!prepared) return []
  return expandParts(scanMathParts(prepared))
}

export function analyzeMathContent(text: string, latexBlocks: string[] = []): MathRenderStats {
  const raw = String(text ?? '')
  const parts = parseMathParts(raw, latexBlocks)
  const renderedFormulas = parts.filter((p) => p.kind === 'block' || p.kind === 'inline').length
  const placeholderCount = parts.filter((p) => p.kind === 'formula-placeholder').length
  const rawDollarCount = (raw.match(/\$\$[\s\S]*?\$\$|\$[^$\n]+?\$/g) || []).length
    + (raw.match(/【公式】/g) || []).length
  const textWithRawMath = parts.some(
    (p) => p.kind === 'text' && (/\$\$|\$[^$\s]|\\frac|\\sqrt|【公式】/.test(p.value)),
  )

  return {
    totalFormulas: renderedFormulas + placeholderCount,
    renderedFormulas,
    placeholderCount,
    hasUnrendered: textWithRawMath || placeholderCount > 0,
    rawDollarCount,
  }
}

function renderKatexHtml(latex: string, displayMode: boolean): string {
  try {
    return katex.renderToString(latex, { ...KATEX_OPTS, displayMode })
  } catch {
    return displayMode ? `$$${latex}$$` : `$${latex}$`
  }
}

function KatexInline({ latex }: { latex: string }) {
  const html = useMemo(() => renderKatexHtml(latex, false), [latex])
  return (
    <span
      className="mx-0.5 inline align-baseline katex-inline"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

function KatexBlock({ latex }: { latex: string }) {
  const html = useMemo(() => renderKatexHtml(latex, true), [latex])
  return (
    <div
      className="my-2 w-full overflow-x-auto text-center katex-block"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

function FormulaPlaceholderBadge() {
  return (
    <span className="mx-0.5 inline-flex items-center rounded border border-amber-400/50 bg-amber-400/15 px-1.5 py-0.5 text-xs text-amber-200">
      公式待补
    </span>
  )
}

function PlainText({ value }: { value: string }) {
  if (!value) return null
  if (value === IMAGE_PLACEHOLDER) {
    return (
      <span className="my-1 inline-flex rounded border border-amber-400/50 bg-amber-400/15 px-2 py-0.5 text-xs text-amber-100">
        图片待补充
      </span>
    )
  }
  if (/<img\b/i.test(value)) {
    return <span className="whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: value.replace(/\n/g, '<br/>') }} />
  }
  return <span className="whitespace-pre-wrap">{value}</span>
}

export default function MathRenderer({ text, className = '', latexBlocks = [] }: MathRendererProps) {
  const parts = useMemo(() => parseMathParts(text, latexBlocks), [text, latexBlocks])

  if (!text?.trim()) return null

  return (
    <div className={`math-renderer ${className}`.trim()}>
      {parts.map((part, idx) => {
        if (part.kind === 'block') return <KatexBlock key={`b-${idx}`} latex={part.value} />
        if (part.kind === 'inline') return <KatexInline key={`i-${idx}`} latex={part.value} />
        if (part.kind === 'html') {
          return (
            <span
              key={`h-${idx}`}
              className="inline-block"
              dangerouslySetInnerHTML={{ __html: part.value }}
            />
          )
        }
        if (part.kind === 'formula-placeholder') return <FormulaPlaceholderBadge key={`f-${idx}`} />
        return <PlainText key={`t-${idx}`} value={part.value} />
      })}
    </div>
  )
}
