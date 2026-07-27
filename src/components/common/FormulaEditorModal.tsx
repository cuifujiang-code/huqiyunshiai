import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import { LATEX_CATEGORIES, type LatexSymbol } from '../LatexPanel'
import { renderLatexText } from './MathRenderer'
import { repairLatexSnippet } from '../../lib/ocrContentNormalize'
import type { FormulaDisplayMode } from '../../context/FormulaEditorContext'

export interface FormulaEditorModalProps {
  open: boolean
  initialLatex?: string
  displayMode?: FormulaDisplayMode
  title?: string
  onClose: () => void
  onApply: (wrapped: string, rawLatex: string) => void
}

const KATEX_OPTS = { throwOnError: false, trust: true, strict: 'ignore' as const }

function symbolPreview(latex: string): string {
  try {
    return katex.renderToString(repairLatexSnippet(latex), { ...KATEX_OPTS, displayMode: true })
  } catch {
    return latex
  }
}

/** 本地数学公式编辑器 — 符号面板 + LaTeX 源码 + 实时 KaTeX 预览 */
export default function FormulaEditorModal({
  open,
  initialLatex = '',
  displayMode: initialMode = 'inline',
  title = '数学公式编辑器',
  onClose,
  onApply,
}: FormulaEditorModalProps) {
  const [latex, setLatex] = useState(initialLatex)
  const [mode, setMode] = useState<FormulaDisplayMode>(initialMode)
  const [activeTab, setActiveTab] = useState(0)
  const [search, setSearch] = useState('')
  const [hoverSym, setHoverSym] = useState<LatexSymbol | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (open) {
      setLatex(initialLatex)
      setMode(initialMode)
      setSearch('')
    }
  }, [open, initialLatex, initialMode])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const insertSymbol = useCallback((sym: string) => {
    const ta = textareaRef.current
    if (!ta) {
      setLatex((v) => v + sym)
      return
    }
    const start = ta.selectionStart ?? latex.length
    const end = ta.selectionEnd ?? start
    const next = latex.slice(0, start) + sym + latex.slice(end)
    setLatex(next)
    requestAnimationFrame(() => {
      ta.focus()
      const pos = start + sym.length
      ta.setSelectionRange(pos, pos)
    })
  }, [latex])

  const previewHtml = useMemo(() => {
    const t = latex.trim()
    if (!t) return ''
    const wrapped = mode === 'block' ? `$$${t}$$` : `$${t}$`
    return renderLatexText(wrapped)
  }, [latex, mode])

  const filteredSymbols = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return LATEX_CATEGORIES[activeTab]?.symbols ?? []
    return LATEX_CATEGORIES.flatMap((cat) =>
      cat.symbols.filter(
        (sym) =>
          sym.label.toLowerCase().includes(q) ||
          sym.latex.toLowerCase().includes(q) ||
          sym.tip?.toLowerCase().includes(q) ||
          sym.keywords?.some((kw) => kw.toLowerCase().includes(q)),
      ),
    )
  }, [activeTab, search])

  const handleConfirm = () => {
    const t = latex.trim()
    const wrapped = mode === 'block' ? (t ? `$$${t}$$` : '$$$$') : (t ? `$${t}$` : '$$')
    onApply(wrapped, t)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4">
      <div
        className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-slate-600 bg-slate-900 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex items-center justify-between border-b border-slate-700 px-4 py-3">
          <div>
            <h3 className="text-base font-semibold text-white">{title}</h3>
            <p className="text-xs text-slate-400">本地 KaTeX 渲染 · 无需联网</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
            aria-label="关闭"
          >
            ✕
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          {/* 符号面板 */}
          <div className="flex w-full shrink-0 flex-col border-b border-slate-700 md:w-72 md:border-b-0 md:border-r">
            <div className="border-b border-slate-700 p-2">
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索符号…"
                className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-xs text-slate-200 outline-none focus:border-blue-500"
              />
            </div>
            {!search && (
              <div className="flex shrink-0 overflow-x-auto border-b border-slate-700">
                {LATEX_CATEGORIES.map((cat, idx) => (
                  <button
                    key={cat.name}
                    type="button"
                    onClick={() => setActiveTab(idx)}
                    className={`shrink-0 px-2 py-1.5 text-[11px] ${
                      idx === activeTab ? 'border-b-2 border-blue-500 text-blue-400' : 'text-slate-400'
                    }`}
                  >
                    {cat.icon} {cat.name}
                  </button>
                ))}
              </div>
            )}
            <div className="flex-1 overflow-y-auto p-2">
              <div className="grid grid-cols-4 gap-1">
                {filteredSymbols.map((sym, idx) => (
                  <button
                    key={`${sym.latex}-${idx}`}
                    type="button"
                    title={sym.tip || sym.latex}
                    onClick={() => insertSymbol(sym.latex)}
                    onMouseEnter={() => setHoverSym(sym)}
                    onMouseLeave={() => setHoverSym(null)}
                    className="rounded border border-transparent p-1.5 text-center text-xs text-slate-300 hover:border-blue-500/40 hover:bg-blue-500/10"
                  >
                    {sym.label.length <= 6 ? sym.label : sym.label.slice(0, 5) + '…'}
                  </button>
                ))}
              </div>
            </div>
            {hoverSym && (
              <div className="shrink-0 border-t border-slate-700 p-2 text-center">
                <div
                  className="text-sm text-white"
                  dangerouslySetInnerHTML={{ __html: symbolPreview(hoverSym.latex) }}
                />
                <code className="mt-1 block text-[10px] text-slate-500">{hoverSym.latex}</code>
              </div>
            )}
          </div>

          {/* 编辑 + 预览 */}
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex items-center gap-2 border-b border-slate-700 px-3 py-2">
              <span className="text-xs text-slate-400">显示方式</span>
              <button
                type="button"
                onClick={() => setMode('inline')}
                className={`rounded px-2 py-1 text-xs ${mode === 'inline' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300'}`}
              >
                行内 $…$
              </button>
              <button
                type="button"
                onClick={() => setMode('block')}
                className={`rounded px-2 py-1 text-xs ${mode === 'block' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300'}`}
              >
                块级 $$…$$
              </button>
            </div>
            <textarea
              ref={textareaRef}
              value={latex}
              onChange={(e) => setLatex(e.target.value)}
              spellCheck={false}
              className="min-h-[140px] flex-1 resize-none border-none bg-slate-950/50 p-4 font-mono text-sm leading-relaxed text-slate-100 outline-none"
              placeholder="输入 LaTeX，或点击左侧符号插入…"
            />
            <div className="shrink-0 border-t border-slate-700 bg-slate-950/80 p-4">
              <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-slate-500">渲染预览</div>
              <div className="min-h-[48px] rounded-lg bg-white/95 px-4 py-3 text-slate-900">
                {previewHtml ? (
                  <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
                ) : (
                  <span className="text-sm italic text-slate-400">预览将显示在这里</span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-700 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
          >
            插入公式
          </button>
        </div>
      </div>
    </div>
  )
}
