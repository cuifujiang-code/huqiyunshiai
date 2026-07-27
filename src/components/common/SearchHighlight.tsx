import MathRenderer from './MathRenderer'

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

interface Props {
  text: string
  keyword?: string
  className?: string
  latexBlocks?: string[]
}

/** 关键词高亮 + LaTeX 渲染（用于全文搜索命中展示） */
export default function SearchHighlight({ text, keyword, className, latexBlocks }: Props) {
  const k = keyword?.trim()
  if (!k) return <MathRenderer text={text} className={className} latexBlocks={latexBlocks} />

  const parts = text.split(new RegExp(`(${escapeRegExp(k)})`, 'gi'))
  return (
    <span className={className}>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="rounded bg-amber-400/35 px-0.5 text-inherit">
            {part}
          </mark>
        ) : (
          part ? <MathRenderer key={i} text={part} className="inline" latexBlocks={latexBlocks} /> : null
        ),
      )}
    </span>
  )
}
