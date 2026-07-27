import { useState, useRef, useCallback, useMemo } from 'react'
import 'katex/dist/katex.min.css'
import { renderLatexText } from './MathRenderer'
import FormulaEditButton from './FormulaEditButton'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface LatexFormulaEditorProps {
  /** LaTeX 源码（支持 $...$ 和 $$...$$） */
  value: string
  /** 值变更回调 */
  onChange: (value: string) => void
  /** textarea 占位文字 */
  placeholder?: string
  /** 容器额外类名 */
  className?: string
}

interface ToolbarButton {
  label: string       /* 显示文本 */
  latex: string       /* 插入的 LaTeX 片段 */
  cursorOffset?: number /* 插入后光标偏移（从片段末尾回退） */
}

interface ToolbarGroup {
  title: string
  buttons: ToolbarButton[]
}

/* ------------------------------------------------------------------ */
/*  工具栏配置                                                          */
/* ------------------------------------------------------------------ */

const TOOLBAR_GROUPS: ToolbarGroup[] = [
  {
    title: '分数与根式',
    buttons: [
      { label: '分数', latex: '\\frac{}{}', cursorOffset: 3 },
      { label: '根号', latex: '\\sqrt{}', cursorOffset: 1 },
      { label: 'n次根', latex: '\\sqrt[]{}', cursorOffset: 1 },
    ],
  },
  {
    title: '积分与求和',
    buttons: [
      { label: '积分', latex: '\\int_{}^{}', cursorOffset: 5 },
      { label: '求和', latex: '\\sum_{}^{}', cursorOffset: 5 },
      { label: '极限', latex: '\\lim_{}', cursorOffset: 1 },
      { label: '乘积', latex: '\\prod_{}^{}', cursorOffset: 5 },
    ],
  },
  {
    title: '希腊字母',
    buttons: [
      { label: 'α', latex: '\\alpha' },
      { label: 'β', latex: '\\beta' },
      { label: 'γ', latex: '\\gamma' },
      { label: 'δ', latex: '\\delta' },
      { label: 'θ', latex: '\\theta' },
      { label: 'λ', latex: '\\lambda' },
      { label: 'π', latex: '\\pi' },
      { label: 'σ', latex: '\\sigma' },
      { label: 'ω', latex: '\\omega' },
      { label: 'Δ', latex: '\\Delta' },
      { label: 'Ω', latex: '\\Omega' },
      { label: '∞', latex: '\\infty' },
    ],
  },
  {
    title: '矩阵',
    buttons: [
      { label: '2x2', latex: '\\begin{pmatrix} & \\\\ & \\end{pmatrix}', cursorOffset: 25 },
      { label: '3x3', latex: '\\begin{pmatrix} & & \\\\ & & \\\\ & & \\end{pmatrix}', cursorOffset: 39 },
      { label: '行列式', latex: '\\begin{vmatrix} & \\\\ & \\end{vmatrix}', cursorOffset: 25 },
    ],
  },
  {
    title: '箭头与关系',
    buttons: [
      { label: '→', latex: '\\rightarrow' },
      { label: '←', latex: '\\leftarrow' },
      { label: '⇒', latex: '\\Rightarrow' },
      { label: '⇐', latex: '\\Leftarrow' },
      { label: '↔', latex: '\\leftrightarrow' },
      { label: '≥', latex: '\\geq' },
      { label: '≤', latex: '\\leq' },
      { label: '≠', latex: '\\neq' },
      { label: '≈', latex: '\\approx' },
      { label: '∈', latex: '\\in' },
      { label: '⊂', latex: '\\subset' },
      { label: '∪', latex: '\\cup' },
      { label: '∩', latex: '\\cap' },
    ],
  },
  {
    title: '上标下标括号',
    buttons: [
      { label: '上标', latex: '^{}', cursorOffset: 1 },
      { label: '下标', latex: '_{}', cursorOffset: 1 },
      { label: '( )', latex: '\\left( \\right)' },
      { label: '[ ]', latex: '\\left[ \\right]' },
      { label: '{ }', latex: '\\left\\{ \\right\\}' },
      { label: '| |', latex: '\\left| \\right|' },
    ],
  },
  {
    title: '其他符号',
    buttons: [
      { label: '×', latex: '\\times' },
      { label: '÷', latex: '\\div' },
      { label: '±', latex: '\\pm' },
      { label: '∂', latex: '\\partial' },
      { label: '∇', latex: '\\nabla' },
      { label: 'forall', latex: '\\forall' },
      { label: 'exists', latex: '\\exists' },
      { label: 'sin', latex: '\\sin' },
      { label: 'cos', latex: '\\cos' },
      { label: 'log', latex: '\\log' },
      { label: 'ln', latex: '\\ln' },
    ],
  },
]

/* ------------------------------------------------------------------ */
/*  渲染函数                                                            */
/* ------------------------------------------------------------------ */

function renderPreview(text: string): string {
  if (!text.trim()) return ''
  return renderLatexText(text)
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function LatexFormulaEditor({
  value,
  onChange,
  placeholder = '输入 LaTeX 公式...',
  className = '',
}: LatexFormulaEditorProps) {
  const [toolbarOpen, setToolbarOpen] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const previewHtml = useMemo(() => renderPreview(value), [value])

  /* ---- 在光标位置插入 LaTeX 片段 ---- */
  const insertAtCursor = useCallback(
    (latex: string, cursorOffset = 0) => {
      const ta = textareaRef.current
      if (!ta) return

      const start = ta.selectionStart ?? 0
      const end = ta.selectionEnd ?? 0
      const newValue = value.slice(0, start) + latex + value.slice(end)
      onChange(newValue)

      // React 异步更新 DOM 后设置光标位置
      requestAnimationFrame(() => {
        const newPos = start + latex.length - (cursorOffset || 0)
        ta.focus()
        ta.setSelectionRange(newPos, newPos)
      })
    },
    [value, onChange],
  )

  /* ---- 键盘快捷键：Ctrl+B 包裹行内 / Ctrl+Shift+B 包裹块级 ---- */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      const ta = e.currentTarget
      const start = ta.selectionStart
      const end = ta.selectionEnd

      // Ctrl+Enter 或 Cmd+Enter：包裹为块级公式
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault()
        const selected = value.slice(start, end) || '{}'
        const wrapped = `$$${selected}$$`
        onChange(value.slice(0, start) + wrapped + value.slice(end))
        requestAnimationFrame(() => {
          ta.focus()
          ta.setSelectionRange(start + 2, start + 2 + selected.length)
        })
        return
      }

      // Ctrl+B：包裹为行内公式
      if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
        e.preventDefault()
        const selected = value.slice(start, end) || '{}'
        const wrapped = `$${selected}$`
        onChange(value.slice(0, start) + wrapped + value.slice(end))
        requestAnimationFrame(() => {
          ta.focus()
          ta.setSelectionRange(start + 1, start + 1 + selected.length)
        })
        return
      }
    },
    [value, onChange],
  )

  return (
    <div className={`latex-formula-editor rounded-lg overflow-hidden border border-slate-700/60 bg-[#1C2332] ${className}`}>
      {/* ---- 顶栏：切换按钮 + 标题提示 ---- */}
      <div className="flex items-center justify-between px-3 py-2 bg-[#151B28] border-b border-slate-700/40">
        <button
          type="button"
          onClick={() => setToolbarOpen((v) => !v)}
          className={`
            inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium
            transition-colors duration-150 select-none
            ${
              toolbarOpen
                ? 'bg-[#2584FF] text-white shadow-md shadow-[#2584FF]/20'
                : 'bg-slate-700/50 text-[#E8ECF3] hover:bg-slate-600/50'
            }
          `}
          aria-pressed={toolbarOpen}
        >
          {/* 公式图标 */}
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M2 14L6 2l3 9 3-7 2 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          快捷符号
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            className={`transition-transform duration-200 ${toolbarOpen ? 'rotate-180' : ''}`}
            aria-hidden="true"
          >
            <path d="M3 4.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <FormulaEditButton
          getInsertContext={() => {
            const ta = textareaRef.current
            if (!ta) return { text: value, start: value.length, end: value.length }
            return { text: value, start: ta.selectionStart, end: ta.selectionEnd }
          }}
          onInsert={(wrapped) => insertAtCursor(wrapped)}
          className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-500/20"
          label="∑ 公式编辑器"
        />

        {!value.trim() && (
          <span className="text-xs text-slate-500">支持 $行内$ 和 $$块级$$ 公式 · Ctrl+B 快速包裹</span>
        )}

        {value && (
          <span className="text-xs text-slate-500 truncate max-w-[200px]">
            {value.length} 字符
          </span>
        )}
      </div>

      {/* ---- 可折叠工具栏 ---- */}
      {toolbarOpen && (
        <div className="border-b border-slate-700/40 bg-[#181F2E] max-h-[280px] overflow-y-auto scrollbar-thin">
          {TOOLBAR_GROUPS.map((group) => (
            <div key={group.title} className="px-3 py-2 border-b border-slate-800/50 last:border-b-0">
              <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-1.5 font-medium">
                {group.title}
              </div>
              <div className="flex flex-wrap gap-1">
                {group.buttons.map((btn) => (
                  <button
                    key={`${group.title}-${btn.label}`}
                    type="button"
                    onClick={() => insertAtCursor(btn.latex, btn.cursorOffset)}
                    title={`插入: ${btn.latex}`}
                    className="
                      inline-flex items-center justify-center min-w-[32px] h-7 px-2
                      rounded text-sm
                      bg-slate-800/80 text-[#E8ECF3]
                      border border-slate-700/50
                      hover:bg-[#2584FF]/20 hover:border-[#2584FF]/40 hover:text-white
                      active:scale-95 transition-all duration-100
                      font-mono leading-none select-none
                    "
                  >
                    {btn.label}
                  </button>
                ))}
              </div>
            </div>
          ))}

          {/* 快捷键提示 */}
          <div className="px-3 py-1.5 bg-[#151B28]/50 flex gap-x-4 text-[11px] text-slate-500">
            <span><kbd className="px-1 py-px rounded bg-slate-700 text-slate-400 text-[10px]">Ctrl</kbd>+<kbd className="px-1 py-px rounded bg-slate-700 text-slate-400 text-[10px]">B</kbd> 行内</span>
            <span><kbd className="px-1 py-px rounded bg-slate-700 text-slate-400 text-[10px]">Ctrl</kbd>+<kbd className="px-1 py-px rounded bg-slate-700 text-slate-400 text-[10px]">Enter</kbd> 块级</span>
          </div>
        </div>
      )}

      {/* ---- 编辑区 + 预览区并排/堆叠 ---- */}
      <div className="flex flex-col md:flex-row">
        {/* 左侧：输入区 */}
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            spellCheck={false}
            rows={5}
            className="
              w-full min-h-[160px] p-3 resize-y
              bg-transparent text-[#E8ECF3]
              placeholder:text-slate-600
              outline-none font-mono text-sm leading-relaxed
              [&::-webkit-scrollbar]:w-2
              [&::-webkit-scrollbar-track]:transparent
              [&::-webkit-scrollbar-thumb]:rounded-full
              [&::-webkit-scrollbar-thumb]:bg-slate-600/50
            "
          />
          {/* 输入区底部渐变遮罩——当内容多时提示可滚动 */}
          <div
            className="absolute bottom-0 left-0 right-0 h-4 pointer-events-none
                       bg-gradient-to-t from-[#1C2332] to-transparent opacity-0 peer-data-[scrollable=true]:opacity-100 transition-opacity"
            style={{ display: 'none' }}
            aria-hidden="true"
          />
        </div>

        {/* 分割线 */}
        <div className="hidden md:block w-px bg-slate-700/50" aria-hidden="true" />

        {/* 右侧：预览区 */}
        <div
          className="
            flex-1 min-h-[120px] md:min-h-0 max-h-[320px] md:max-h-none
            p-3 overflow-auto text-[#E8ECF3] text-sm
            border-t border-slate-700/40 md:border-t-0
            [&::-webkit-scrollbar]:w-2
            [&::-webkit-scrollbar-track]:transparent
            [&::-webkit-scrollbar-thumb]:rounded-full
            [&::-webkit-scrollbar-thumb]:bg-slate-600/50
          "
        >
          {previewHtml ? (
            <div
              className="latex-preview"
              dangerouslySetInnerHTML={{ __html: previewHtml }}
            />
          ) : (
            <div className="h-full flex items-center justify-center text-slate-600 text-sm italic select-none">
              预览区域
            </div>
          )}
        </div>
      </div>

      {/* ---- 底部状态栏 ---- */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#151B28]/60 border-t border-slate-700/30 text-[11px] text-slate-500">
        <span>LaTeX · KaTeX</span>
        <span className="flex items-center gap-3">
          {(value.match(/\$\$/g)?.length ?? 0) > 0 && (
            <span>{(value.match(/\$\$/g)!.length / 2)} 个块级公式</span>
          )}
          {(value.match(/\$(?!\$)[^$]+\$/g)?.length ?? 0) > 0 && (
            <span>{value.match(/\$(?!\$)[^$]+\$/g)!.length} 个行内公式</span>
          )}
          {!value.includes('$') && <span>未检测到公式标记</span>}
        </span>
      </div>
    </div>
  )
}
