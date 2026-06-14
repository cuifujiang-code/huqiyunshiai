import { useCallback, useRef, useState } from 'react'
import GeoGebraBoardModal from './GeoGebraBoardModal'
import LatexPanel from './LatexPanel'
import MathRenderer from './common/MathRenderer'
import FormulaEditButton from './common/FormulaEditButton'
import QuestionRichTextEditor, { type QuestionRichTextEditorHandle } from './QuestionRichTextEditor'
import { fileToBase64 } from '../lib/fileBase64'
import { uploadQuestionImage } from '../lib/teacherApi'
import { sanitizeAnalysisText } from '../lib/analysisText'
import type { BankQuestion } from '../types/teacher'
import { btnSecondary } from '../types/teacher'
import { compressForScene } from '../utils/imageCompress'

type EditField = 'content' | 'answer' | 'analysis'

export interface SplitQuestionEditorProps {
  question: Partial<BankQuestion>
  teacherId: string
  onChange: (q: Partial<BankQuestion>) => void
}

export default function SplitQuestionEditor({ question, teacherId, onChange }: SplitQuestionEditorProps) {
  const [activeField, setActiveField] = useState<EditField>('content')
  const [latexOpen, setLatexOpen] = useState(false)
  const [geoOpen, setGeoOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const contentRef = useRef<QuestionRichTextEditorHandle>(null)
  const answerRef = useRef<QuestionRichTextEditorHandle>(null)
  const analysisRef = useRef<QuestionRichTextEditorHandle>(null)

  const getRef = useCallback((field: EditField) => {
    if (field === 'answer') return answerRef
    if (field === 'analysis') return analysisRef
    return contentRef
  }, [])

  const updateField = useCallback((field: EditField, value: string) => {
    const next = field === 'analysis' ? sanitizeAnalysisText(value) : value
    onChange({ ...question, [field]: next })
  }, [onChange, question])

  const insertLatex = useCallback((latex: string) => {
    const wrapped = latex.includes('$') ? latex : `$${latex}$`
    getRef(activeField).current?.insertText(wrapped)
  }, [activeField, getRef])

  const uploadImage = useCallback(async (file: File) => {
    if (activeField === 'analysis') {
      setError('解析字段仅支持 Markdown/LaTeX 文本，不支持插入图片')
      return null
    }
    if (!file.type.startsWith('image/')) {
      setError('请选择图片文件')
      return null
    }
    setUploading(true)
    setError(null)
    try {
      const compressed = await compressForScene(file, 'screenshot')
      const base64 = await fileToBase64(compressed.file)
      const url = await uploadQuestionImage(teacherId, base64, compressed.file.name, compressed.file.type)
      URL.revokeObjectURL(compressed.url)
      getRef(activeField).current?.insertImageMarkdown(url, '题目图片')
      return url
    } catch (e) {
      setError(e instanceof Error ? e.message : '图片上传失败')
      return null
    } finally {
      setUploading(false)
    }
  }, [activeField, getRef, teacherId])

  const insertGeoImage = useCallback((url: string) => {
    getRef(activeField).current?.insertImageMarkdown(url, '几何图')
  }, [activeField, getRef])

  const fieldBtn = (field: EditField, label: string) => (
    <button
      type="button"
      className={`text-xs px-2 py-1 rounded ${activeField === field ? 'bg-blue-500/30 text-blue-200' : 'bg-white/5 text-[#8A94A9]'}`}
      onClick={() => setActiveField(field)}
    >
      {label}
    </button>
  )

  const editorProps = {
    onPasteImage: activeField === 'analysis' ? undefined : uploadImage,
    minRows: 3 as const,
  }

  return (
    <div className="space-y-2">
      <div className="rounded-[6px] border border-white/[0.04] bg-[#121722] p-3 text-sm leading-relaxed">
        <MathRenderer text={question.content || ''} />
      </div>

      {(question.answer || question.analysis) && (
        <div className="space-y-1 text-xs text-[#8A94A9]">
          {question.answer && (
            <p><span className="text-emerald-400/80">答案：</span><MathRenderer text={question.answer} className="inline text-sm" /></p>
          )}
          {question.analysis && (
            <p><span className="text-sky-400/80">解析：</span><MathRenderer text={question.analysis} className="inline text-sm" /></p>
          )}
        </div>
      )}

      <details className="text-xs text-[#8A94A9]">
        <summary className="cursor-pointer hover:text-[#C5D0E6]">编辑原始文本（公式 / 图片 / 作图）</summary>
        <div className="mt-2 space-y-2">
          <div className="flex flex-wrap gap-2">
            {fieldBtn('content', '题干')}
            {fieldBtn('answer', '答案')}
            {fieldBtn('analysis', '解析')}
            <button type="button" className={`${btnSecondary} text-xs px-2 py-1`} onClick={() => setLatexOpen(true)}>∑ 快捷符号</button>
            <FormulaEditButton
              onInsert={(wrapped) => getRef(activeField).current?.insertText(wrapped)}
              className={`${btnSecondary} text-xs px-2 py-1 !text-emerald-300`}
              label="∑ 公式编辑器"
            />
            <button type="button" className={`${btnSecondary} text-xs px-2 py-1`} onClick={() => setGeoOpen(true)} disabled={activeField === 'analysis'}>📐 作图</button>
            {activeField !== 'analysis' && (
            <label className={`${btnSecondary} text-xs px-2 py-1 cursor-pointer`}>
              {uploading ? '上传中…' : '🖼 插图'}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={uploading}
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void uploadImage(f)
                  e.target.value = ''
                }}
              />
            </label>
            )}
          </div>
          {error && <p className="text-red-300">{error}</p>}
          {activeField === 'content' && (
            <QuestionRichTextEditor
              ref={contentRef}
              value={question.content || ''}
              onChange={(v) => updateField('content', v)}
              onFocus={() => setActiveField('content')}
              {...editorProps}
            />
          )}
          {activeField === 'answer' && (
            <QuestionRichTextEditor
              ref={answerRef}
              value={question.answer || ''}
              onChange={(v) => updateField('answer', v)}
              onFocus={() => setActiveField('answer')}
              {...editorProps}
            />
          )}
          {activeField === 'analysis' && (
            <QuestionRichTextEditor
              ref={analysisRef}
              value={question.analysis || ''}
              onChange={(v) => updateField('analysis', v)}
              onFocus={() => setActiveField('analysis')}
              {...editorProps}
            />
          )}
        </div>
      </details>

      <LatexPanel isOpen={latexOpen} onClose={() => setLatexOpen(false)} onInsert={insertLatex} />
      <GeoGebraBoardModal
        open={geoOpen}
        onClose={() => setGeoOpen(false)}
        teacherId={teacherId}
        onInsert={insertGeoImage}
      />
    </div>
  )
}
