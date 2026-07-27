import { useFormulaEditorOptional, extractLatexFromSelection } from '../../context/FormulaEditorContext'

interface Props {
  /** 获取当前文本与选区，用于插入公式 */
  getInsertContext?: () => { text: string; start: number; end: number } | null
  onInsert: (wrapped: string, rawLatex: string) => void
  className?: string
  label?: string
  title?: string
}

/** 打开本地公式编辑器的统一按钮 */
export default function FormulaEditButton({
  getInsertContext,
  onInsert,
  className = '',
  label = '∑ 公式编辑器',
  title = '打开本地数学公式编辑器',
}: Props) {
  const formulaEditor = useFormulaEditorOptional()
  if (!formulaEditor) return null

  const handleClick = () => {
    const ctx = getInsertContext?.()
    const initialLatex = ctx
      ? extractLatexFromSelection(ctx.text, ctx.start, ctx.end)
      : ''
    formulaEditor.openFormulaEditor({
      initialLatex,
      displayMode: 'inline',
      title: '数学公式编辑器',
      onApply: onInsert,
    })
  }

  return (
    <button
      type="button"
      title={title}
      onClick={handleClick}
      className={
        className ||
        'inline-flex items-center gap-1 rounded-md border border-blue-500/40 bg-blue-500/10 px-2 py-1 text-xs font-medium text-blue-300 hover:bg-blue-500/20'
      }
    >
      {label}
    </button>
  )
}
