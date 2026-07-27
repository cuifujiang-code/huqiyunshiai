import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, ClipboardEvent } from 'react'
import MathRenderer from '../common/MathRenderer'
import FormulaEditButton from '../common/FormulaEditButton'
import { extractLatexFromClipboard, joinLatexParts } from '../../lib/mathtypePaste'
import {
  EMBEDDED_FIGURE_TOKEN,
  extractEmbeddedFigures,
  figureSrcFromTag,
  mergeEmbeddedFigures,
} from '../../lib/embeddedImages'

interface Props {
  value: string
  /** 与 value 中【嵌入图形】按序对应的 img 标签（Word 导入） */
  figures?: string[]
  onChange: (value: string) => void
  style?: CSSProperties
  isActive: boolean
  onActivate: () => void
  onInsertFigure?: () => void
  hasSourcePages?: boolean
}

/** 画布内联编辑：点击预览区直接改，白底与全书风格一致 */
export default function BookInlineBlockEditor({
  value,
  figures: storedFigures = [],
  onChange,
  style,
  isActive,
  onActivate,
  onInsertFigure,
  hasSourcePages,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const figuresRef = useRef<string[]>([])
  const [editText, setEditText] = useState('')
  const [figures, setFigures] = useState<string[]>([])

  const resolveDisplayValue = (raw: string) => {
    if (storedFigures.length && raw.includes(EMBEDDED_FIGURE_TOKEN)) {
      return mergeEmbeddedFigures(raw, storedFigures)
    }
    return raw
  }

  const syncFromValue = (raw: string) => {
    const merged = resolveDisplayValue(raw)
    const { text, figures: figs } = extractEmbeddedFigures(merged)
    figuresRef.current = figs
    setFigures(figs)
    setEditText(text)
  }

  useLayoutEffect(() => {
    if (isActive) syncFromValue(value)
  }, [isActive, value, storedFigures])

  const insertAtCursor = (snippet: string) => {
    const ta = textareaRef.current
    const merged = mergeEmbeddedFigures(editText, figuresRef.current)
    const start = ta?.selectionStart ?? merged.length
    const end = ta?.selectionEnd ?? start
    const nextRaw = merged.slice(0, start) + snippet + merged.slice(end)
    onChange(nextRaw)
    syncFromValue(nextRaw)
    requestAnimationFrame(() => {
      if (!ta) return
      ta.focus()
      const { text } = extractEmbeddedFigures(nextRaw)
      const pos = Math.min(text.length, start + snippet.length)
      ta.setSelectionRange(pos, pos)
    })
  }

  const handleEditChange = (text: string) => {
    setEditText(text)
    onChange(mergeEmbeddedFigures(text, figuresRef.current))
  }

  const handlePaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const html = e.clipboardData.getData('text/html')
    const plain = e.clipboardData.getData('text/plain')
    const latexParts = extractLatexFromClipboard(html, plain)
    if (!latexParts.length) return
    e.preventDefault()
    insertAtCursor(joinLatexParts(latexParts))
  }

  useEffect(() => {
    if (isActive) textareaRef.current?.focus()
  }, [isActive])

  if (!isActive) {
    return (
      <div
        className="group min-h-[2.5rem] cursor-text rounded-md px-1 py-0.5 transition hover:bg-slate-50/80"
        onClick={onActivate}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') onActivate()
        }}
      >
        {value.trim() ? (
          <MathRenderer text={resolveDisplayValue(value)} className="math-renderer pointer-events-none" />
        ) : (
          <span className="text-slate-400 italic">点击此处直接编辑…</span>
        )}
        <span className="mt-1 block text-[10px] text-blue-500 opacity-0 transition group-hover:opacity-100">
          点击编辑
        </span>
      </div>
    )
  }

  return (
    <div className="rounded-md border border-blue-300 bg-white shadow-sm ring-2 ring-blue-400/20">
      <div className="flex flex-wrap items-center gap-2 border-b border-blue-100 bg-blue-50/60 px-2 py-1 text-xs text-slate-600">
        <span className="font-medium text-blue-700">正在编辑</span>
        <span className="text-slate-400">$...$ 行内 · $$...$$ 块级 · Ctrl+V 可粘贴 MathType</span>
        {hasSourcePages && onInsertFigure && (
          <button
            type="button"
            className="ml-auto rounded border border-blue-300 bg-white px-2 py-0.5 text-blue-700 hover:bg-blue-50"
            onClick={onInsertFigure}
          >
            ✂ 从原图提取图形
          </button>
        )}
        <FormulaEditButton
          getInsertContext={() => {
            const ta = textareaRef.current
            if (!ta) return { text: editText, start: editText.length, end: editText.length }
            return { text: editText, start: ta.selectionStart, end: ta.selectionEnd }
          }}
          onInsert={(wrapped) => insertAtCursor(wrapped)}
          className="rounded border border-blue-300 bg-white px-2 py-0.5 text-blue-700 hover:bg-blue-50"
          label="∑ 公式编辑器"
        />
      </div>

      {figures.length > 0 && (
        <div className="flex flex-wrap gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2">
          {figures.map((tag, i) => {
            const src = figureSrcFromTag(tag)
            return (
              <div
                key={`fig-${i}-${src?.slice(0, 24)}`}
                className="flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-[10px] text-slate-600"
              >
                {src ? (
                  <img src={src} alt="" className="h-8 max-w-[80px] rounded object-contain" />
                ) : null}
                <span>图形 {i + 1}</span>
              </div>
            )
          })}
        </div>
      )}

      <textarea
        ref={textareaRef}
        value={editText}
        onChange={(e) => handleEditChange(e.target.value)}
        onPaste={handlePaste}
        spellCheck={false}
        rows={Math.max(6, Math.min(20, editText.split('\n').length + 2))}
        style={style}
        className="w-full resize-y border-none bg-transparent px-3 py-2 outline-none leading-relaxed"
        placeholder="在此编辑；Ctrl+V 粘贴 MathType/Word 公式；图形以【嵌入图形】占位"
      />
      {value.trim() && (
        <div className="border-t border-dashed border-slate-200 bg-slate-50/50 px-3 py-2">
          <div className="mb-1 text-[10px] font-medium text-slate-500">实时预览</div>
          <MathRenderer text={resolveDisplayValue(value)} className="math-renderer" />
        </div>
      )}
    </div>
  )
}
