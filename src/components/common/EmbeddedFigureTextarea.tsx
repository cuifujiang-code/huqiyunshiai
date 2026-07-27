import { useLayoutEffect, useRef, useState, type ClipboardEvent } from 'react'
import {
  EMBEDDED_FIGURE_TOKEN,
  extractEmbeddedFigures,
  figureSrcFromTag,
  mergeEmbeddedFigures,
} from '../../lib/embeddedImages'
import { extractLatexFromClipboard, joinLatexParts } from '../../lib/mathtypePaste'

interface Props {
  value: string
  onChange: (value: string) => void
  className?: string
  rows?: number
  placeholder?: string
  /** 深色主题（章节编辑侧栏） */
  variant?: 'light' | 'dark'
}

/** 编辑区隐藏 base64 图形，以【嵌入图形】占位 + 缩略图条 */
export default function EmbeddedFigureTextarea({
  value,
  onChange,
  className = '',
  rows = 6,
  placeholder,
  variant = 'light',
}: Props) {
  const figuresRef = useRef<string[]>([])
  const [editText, setEditText] = useState('')
  const [figures, setFigures] = useState<string[]>([])

  const syncFromValue = (raw: string) => {
    const { text, figures: figs } = extractEmbeddedFigures(raw)
    figuresRef.current = figs
    setFigures(figs)
    setEditText(text)
  }

  useLayoutEffect(() => {
    syncFromValue(value)
  }, [value])

  const handleChange = (text: string) => {
    setEditText(text)
    onChange(mergeEmbeddedFigures(text, figuresRef.current))
  }

  const handlePaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const html = e.clipboardData.getData('text/html')
    const plain = e.clipboardData.getData('text/plain')
    const latexParts = extractLatexFromClipboard(html, plain)
    if (!latexParts.length) return
    e.preventDefault()
    const ta = e.currentTarget
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const insert = joinLatexParts(latexParts)
    const next = editText.slice(0, start) + insert + editText.slice(end)
    handleChange(next)
    requestAnimationFrame(() => {
      ta.focus()
      const pos = start + insert.length
      ta.setSelectionRange(pos, pos)
    })
  }

  const thumbCls =
    variant === 'dark'
      ? 'flex items-center gap-1 rounded border border-white/10 bg-[#1a2233] px-2 py-1 text-[10px] text-[#8A94A9]'
      : 'flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-[10px] text-slate-600'

  const barCls =
    variant === 'dark'
      ? 'flex flex-wrap gap-2 border-b border-white/[0.06] bg-[#1a2233]/80 px-2 py-1.5'
      : 'flex flex-wrap gap-2 border-b border-slate-100 bg-slate-50 px-2 py-1.5'

  return (
    <div className={variant === 'dark' ? 'rounded-[6px] overflow-hidden' : ''}>
      {figures.length > 0 && (
        <div className={barCls}>
          {figures.map((tag, i) => {
            const src = figureSrcFromTag(tag)
            return (
              <div key={`fig-${i}-${src?.slice(0, 32)}`} className={thumbCls}>
                {src ? (
                  <img src={src} alt="" className="h-7 max-w-[72px] rounded object-contain" />
                ) : null}
                <span>图形 {i + 1}</span>
              </div>
            )
          })}
        </div>
      )}
      <textarea
        value={editText}
        onChange={(e) => handleChange(e.target.value)}
        onPaste={handlePaste}
        rows={rows}
        spellCheck={false}
        className={className}
        placeholder={placeholder ?? `文字与公式；Ctrl+V 粘贴 MathType；图形为 ${EMBEDDED_FIGURE_TOKEN}`}
      />
    </div>
  )
}
