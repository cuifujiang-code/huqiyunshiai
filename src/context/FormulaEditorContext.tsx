import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import FormulaEditorModal from '../components/common/FormulaEditorModal'

export type FormulaDisplayMode = 'inline' | 'block'

export interface FormulaEditorRequest {
  /** 初始 LaTeX（不含 $ 定界符） */
  initialLatex?: string
  displayMode?: FormulaDisplayMode
  title?: string
  onApply: (wrapped: string, rawLatex: string) => void
}

interface FormulaEditorContextValue {
  openFormulaEditor: (request: FormulaEditorRequest) => void
  closeFormulaEditor: () => void
}

const FormulaEditorContext = createContext<FormulaEditorContextValue | null>(null)

export function FormulaEditorProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const requestRef = useRef<FormulaEditorRequest | null>(null)
  const [modalKey, setModalKey] = useState(0)

  const closeFormulaEditor = useCallback(() => {
    setOpen(false)
    requestRef.current = null
  }, [])

  const openFormulaEditor = useCallback((request: FormulaEditorRequest) => {
    requestRef.current = request
    setModalKey((k) => k + 1)
    setOpen(true)
  }, [])

  const handleApply = useCallback(
    (wrapped: string, rawLatex: string) => {
      requestRef.current?.onApply(wrapped, rawLatex)
      closeFormulaEditor()
    },
    [closeFormulaEditor],
  )

  const value = useMemo(
    () => ({ openFormulaEditor, closeFormulaEditor }),
    [openFormulaEditor, closeFormulaEditor],
  )

  return (
    <FormulaEditorContext.Provider value={value}>
      {children}
      {open && requestRef.current && (
        <FormulaEditorModal
          key={modalKey}
          open={open}
          initialLatex={requestRef.current.initialLatex ?? ''}
          displayMode={requestRef.current.displayMode ?? 'inline'}
          title={requestRef.current.title}
          onClose={closeFormulaEditor}
          onApply={handleApply}
        />
      )}
    </FormulaEditorContext.Provider>
  )
}

export function useFormulaEditor() {
  const ctx = useContext(FormulaEditorContext)
  if (!ctx) {
    throw new Error('useFormulaEditor 须在 FormulaEditorProvider 内使用')
  }
  return ctx
}

/** 可选：无 Provider 时不报错，按钮可隐藏 */
export function useFormulaEditorOptional() {
  return useContext(FormulaEditorContext)
}

/** 从选区或 $...$ / $$...$$ 中提取 LaTeX 源码 */
export function extractLatexFromSelection(text: string, start: number, end: number): string {
  if (start !== end) return text.slice(start, end).trim()
  const inline = text.slice(start).match(/^\$([^$\n]+)\$/)
  if (inline) return inline[1].trim()
  const block = text.slice(start).match(/^\$\$([\s\S]*?)\$\$/)
  if (block) return block[1].trim()
  return ''
}

export function wrapLatex(latex: string, mode: FormulaDisplayMode): string {
  const t = latex.trim()
  if (!t) return mode === 'block' ? '$$$$' : '$$'
  if (mode === 'block') return `$$${t}$$`
  return `$${t}$`
}
