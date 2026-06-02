import { useMemo } from 'react'
import TeX from '@matejmazur/react-katex'
import 'katex/dist/katex.min.css'

const KATEX_SETTINGS = {
  throwOnError: false,
  trust: true,
  strict: false,
} as const

const IMG_TAG_RE = /<img\b[^>]*\/?>/gi

export interface MathRendererProps {
  /** 题目 content / answer / analysis 等混合文本 */
  text: string
  className?: string
}

type Part =
  | { kind: 'text'; value: string }
  | { kind: 'inline'; value: string }
  | { kind: 'block'; value: string }
  | { kind: 'html'; value: string }

/** 预处理：还原转义、统一定界符 */
function prepareMathText(raw: string): string {
  let t = String(raw ?? '')
  t = t.replace(/&#36;/g, '$').replace(/&dollar;/gi, '$')
  t = t.replace(/\uFF04/g, '$')
  t = t.replace(/\\\$/g, '$')
  t = t.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\r/g, '\r')
  t = t.replace(/\\\\/g, '\\')
  t = t.replace(/\\\[([\s\S]*?)\\\]/g, (_, inner) => `$$${inner.trim()}$$`)
  t = t.replace(/\\\(([\s\S]*?)\\\)/g, (_, inner) => `$${inner.trim()}$`)
  return t
}

/**
 * 遍历文本，优先切分 $$...$$ 块级公式，再切分 $...$ 行内公式与 <img> 标签
 */
export function parseMathText(text: string): Part[] {
  const prepared = prepareMathText(text)
  if (!prepared) return []

  const parts: Part[] = []
  const tokenRe = /(\$\$[\s\S]*?\$\$|\$[^$\n]+?\$|<img\b[^>]*\/?>)/gi
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = tokenRe.exec(prepared)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ kind: 'text', value: prepared.slice(lastIndex, match.index) })
    }

    const chunk = match[0]
    if (chunk.startsWith('$$') && chunk.endsWith('$$')) {
      const formula = chunk.slice(2, -2).trim()
      if (formula) parts.push({ kind: 'block', value: formula })
    } else if (chunk.startsWith('$') && chunk.endsWith('$')) {
      const formula = chunk.slice(1, -1).trim()
      if (formula) parts.push({ kind: 'inline', value: formula })
    } else if (/^<img\b/i.test(chunk)) {
      parts.push({ kind: 'html', value: chunk })
    }

    lastIndex = match.index + chunk.length
  }

  if (lastIndex < prepared.length) {
    parts.push({ kind: 'text', value: prepared.slice(lastIndex) })
  }

  return parts
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '<br/>')
}

/** 普通文本：保留换行；若含 <img> 则保留 img 标签 */
function PlainTextBlock({ value }: { value: string }) {
  if (!value) return null

  if (IMG_TAG_RE.test(value)) {
    IMG_TAG_RE.lastIndex = 0
    const htmlParts: string[] = []
    let cursor = 0
    let imgMatch: RegExpExecArray | null
    const re = new RegExp(IMG_TAG_RE.source, 'gi')

    while ((imgMatch = re.exec(value)) !== null) {
      if (imgMatch.index > cursor) {
        htmlParts.push(escapeHtml(value.slice(cursor, imgMatch.index)))
      }
      htmlParts.push(imgMatch[0])
      cursor = imgMatch.index + imgMatch[0].length
    }
    if (cursor < value.length) {
      htmlParts.push(escapeHtml(value.slice(cursor)))
    }

    return (
      <span
        className="whitespace-pre-wrap"
        dangerouslySetInnerHTML={{ __html: htmlParts.join('') }}
      />
    )
  }

  return <span className="whitespace-pre-wrap">{value}</span>
}

export default function MathRenderer({ text, className = '' }: MathRendererProps) {
  const parts = useMemo(() => parseMathText(text), [text])

  if (!text?.trim()) return null

  return (
    <div className={`math-renderer ${className}`.trim()}>
      {parts.map((part, idx) => {
        if (part.kind === 'block') {
          return (
            <TeX
              key={`block-${idx}`}
              block
              math={part.value}
              className="my-2 block w-full overflow-x-auto text-center"
              settings={KATEX_SETTINGS}
            />
          )
        }
        if (part.kind === 'inline') {
          return (
            <TeX
              key={`inline-${idx}`}
              math={part.value}
              className="mx-0.5 inline align-baseline"
              settings={KATEX_SETTINGS}
            />
          )
        }
        if (part.kind === 'html') {
          return (
            <span
              key={`html-${idx}`}
              className="inline-block"
              dangerouslySetInnerHTML={{ __html: part.value }}
            />
          )
        }
        return <PlainTextBlock key={`text-${idx}`} value={part.value} />
      })}
    </div>
  )
}
