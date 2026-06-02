import { useCallback, useEffect, useRef, useState } from 'react'
import GeoGebraBoardModal from './GeoGebraBoardModal'
import LatexPanel from './LatexPanel'
import MathRenderer from './MathRenderer'
import { fileToBase64 } from '../lib/fileBase64'
import { ocrCorrectQuestion, uploadQuestionImage } from '../lib/teacherApi'
import type { BankQuestion } from '../types/teacher'
import {
  ALL_QUESTION_TYPES,
  DIFFICULTIES,
  SUBJECT_QUESTION_TYPES,
  btnPrimary,
  btnSecondary,
  inputClass,
} from '../types/teacher'
import { compressForScene } from '../utils/imageCompress'

const OPTION_LABELS = ['A', 'B', 'C', 'D', 'E', 'F']

type EditField = 'content' | 'answer' | 'analysis' | `option-${number}`

export interface QuestionEditModalProps {
  question: BankQuestion
  teacherId: string
  onSave: (question: BankQuestion) => Promise<void>
  onCancel: () => void
}

function insertTextAtCursor(
  value: string,
  insert: string,
  selectionStart: number,
  selectionEnd: number,
): { next: string; cursor: number } {
  const next = value.slice(0, selectionStart) + insert + value.slice(selectionEnd)
  const cursor = selectionStart + insert.length
  return { next, cursor }
}

export default function QuestionEditModal({
  question,
  teacherId,
  onSave,
  onCancel,
}: QuestionEditModalProps) {
  const [draft, setDraft] = useState<BankQuestion>(() => ({
    ...question,
    options: [...(question.options ?? [])],
    tags: [...(question.tags ?? [])],
  }))
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [correcting, setCorrecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [latexOpen, setLatexOpen] = useState(false)
  const [geoBoardOpen, setGeoBoardOpen] = useState(false)
  const [activeField, setActiveField] = useState<EditField>('content')

  const contentRef = useRef<HTMLTextAreaElement>(null)
  const answerRef = useRef<HTMLInputElement>(null)
  const analysisRef = useRef<HTMLTextAreaElement>(null)
  const optionRefs = useRef<(HTMLInputElement | null)[]>([])

  const questionTypes = SUBJECT_QUESTION_TYPES[draft.subject] || ALL_QUESTION_TYPES
  const isChoice = draft.question_type === '选择题' || (draft.options?.length ?? 0) > 0

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !latexOpen && !geoBoardOpen) onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [latexOpen, geoBoardOpen, onCancel])

  const getFieldRef = useCallback((field: EditField) => {
    if (field === 'content') return contentRef
    if (field === 'answer') return answerRef
    if (field === 'analysis') return analysisRef
    if (field.startsWith('option-')) {
      const idx = Number(field.slice(7))
      return { current: optionRefs.current[idx] }
    }
    return contentRef
  }, [])

  const updateField = useCallback((field: EditField, value: string, cursor?: number) => {
    if (field === 'content') setDraft((d) => ({ ...d, content: value }))
    else if (field === 'answer') setDraft((d) => ({ ...d, answer: value }))
    else if (field === 'analysis') setDraft((d) => ({ ...d, analysis: value }))
    else if (field.startsWith('option-')) {
      const idx = Number(field.slice(7))
      setDraft((d) => {
        const options = [...(d.options ?? [])]
        options[idx] = value
        return { ...d, options }
      })
    }
    if (cursor != null) {
      requestAnimationFrame(() => {
        const ref = getFieldRef(field)
        const el = ref.current
        if (el && 'setSelectionRange' in el) {
          el.focus()
          el.setSelectionRange(cursor, cursor)
        }
      })
    }
  }, [getFieldRef])

  const insertLatex = useCallback((latex: string) => {
    const field = activeField
    const ref = getFieldRef(field)
    const el = ref.current
    let value = ''
    if (field === 'content') value = draft.content
    else if (field === 'answer') value = draft.answer
    else if (field === 'analysis') value = draft.analysis
    else if (field.startsWith('option-')) {
      const idx = Number(field.slice(7))
      value = draft.options?.[idx] ?? ''
    }

    const wrapped = latex.includes('$') ? latex : `$${latex}$`
    if (el && 'selectionStart' in el) {
      const { next, cursor } = insertTextAtCursor(
        value,
        wrapped,
        el.selectionStart ?? value.length,
        el.selectionEnd ?? value.length,
      )
      updateField(field, next, cursor)
    } else {
      updateField(field, value + wrapped)
    }
  }, [activeField, draft, getFieldRef, updateField])

  const getFieldValue = useCallback((field: EditField, data: BankQuestion) => {
    if (field === 'content') return data.content
    if (field === 'answer') return data.answer
    if (field === 'analysis') return data.analysis
    if (field.startsWith('option-')) {
      const idx = Number(field.slice(7))
      return data.options?.[idx] ?? ''
    }
    return data.content
  }, [])

  const insertImageMarkdown = useCallback((url: string, alt = '几何图') => {
    const md = `\n![${alt}](${url})\n`
    const field = activeField
    const ref = getFieldRef(field)
    const el = ref.current
    const value = getFieldValue(field, draft)

    if (el && 'selectionStart' in el) {
      const { next, cursor } = insertTextAtCursor(
        value,
        md,
        el.selectionStart ?? value.length,
        el.selectionEnd ?? value.length,
      )
      updateField(field, next, cursor)
    } else {
      updateField(field, value + md)
    }
  }, [activeField, draft, getFieldRef, getFieldValue, updateField])

  const handleImageUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('请选择图片文件')
      return
    }
    setUploading(true)
    setError(null)
    try {
      const compressed = await compressForScene(file, 'screenshot')
      const base64 = await fileToBase64(compressed.file)
      const url = await uploadQuestionImage(teacherId, base64, compressed.file.name, compressed.file.type)
      insertImageMarkdown(url, '题目图片')
      URL.revokeObjectURL(compressed.url)
    } catch (e) {
      setError(e instanceof Error ? e.message : '图片上传失败')
    } finally {
      setUploading(false)
    }
  }

  const handleOcrCorrect = async () => {
    setCorrecting(true)
    setError(null)
    try {
      const fixed = await ocrCorrectQuestion({
        content: draft.content,
        options: draft.options,
        answer: draft.answer,
        analysis: draft.analysis,
        subject: draft.subject,
        grade: draft.grade,
        question_type: draft.question_type,
      })
      setDraft((d) => ({
        ...d,
        content: fixed.content,
        options: fixed.options ?? d.options,
        answer: fixed.answer,
        analysis: fixed.analysis,
      }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'AI 校正失败')
    } finally {
      setCorrecting(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      await onSave(draft)
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败')
      setSaving(false)
    }
  }

  const addOption = () => {
    setDraft((d) => ({ ...d, options: [...(d.options ?? []), ''] }))
  }

  const removeOption = (idx: number) => {
    setDraft((d) => ({
      ...d,
      options: (d.options ?? []).filter((_, i) => i !== idx),
    }))
  }

  const fieldLabel = (className = 'mb-1 block text-xs font-medium text-slate-400') => className

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3">
        <div className="flex h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
          {/* 头部 */}
          <div className="flex shrink-0 items-center justify-between border-b border-slate-700 px-5 py-3">
            <h3 className="text-lg font-semibold text-white">编辑题目</h3>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className={btnSecondary}
                disabled={correcting}
                onClick={handleOcrCorrect}
              >
                {correcting ? '校正中…' : 'AI 重校正'}
              </button>
              <button type="button" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white" onClick={onCancel}>
                ✕
              </button>
            </div>
          </div>

          {error && (
            <p className="mx-5 mt-3 shrink-0 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
            </p>
          )}

          {/* 左右分栏 */}
          <div className="flex min-h-0 flex-1">
            {/* 左侧编辑区 */}
            <div className="flex w-1/2 flex-col border-r border-slate-700">
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {/* 题目属性 */}
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className={fieldLabel()}>题型</label>
                    <select
                      className={`${inputClass} text-sm py-2`}
                      value={draft.question_type}
                      onChange={(e) => setDraft({ ...draft, question_type: e.target.value })}
                    >
                      {questionTypes.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={fieldLabel()}>难度</label>
                    <select
                      className={`${inputClass} text-sm py-2`}
                      value={draft.difficulty}
                      onChange={(e) => setDraft({ ...draft, difficulty: e.target.value })}
                    >
                      {DIFFICULTIES.map((d) => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={fieldLabel()}>知识点</label>
                    <input
                      className={`${inputClass} text-sm py-2`}
                      value={draft.knowledge_point}
                      onChange={(e) => setDraft({ ...draft, knowledge_point: e.target.value })}
                      placeholder="如：一元二次方程"
                    />
                  </div>
                </div>

                {/* 工具栏 */}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className={`${btnSecondary} text-xs py-1.5`}
                    onClick={() => setLatexOpen((v) => !v)}
                  >
                    {latexOpen ? '▲ 收起 LaTeX 面板' : '▼ LaTeX 符号面板'}
                  </button>
                  <label className={`${btnSecondary} cursor-pointer text-xs py-1.5 ${uploading ? 'opacity-50' : ''}`}>
                    {uploading ? '上传中…' : '📷 插入图片'}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={uploading}
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        if (f) void handleImageUpload(f)
                        e.target.value = ''
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    className={`${btnSecondary} text-xs py-1.5`}
                    onClick={() => setGeoBoardOpen(true)}
                  >
                    📐 几何画板
                  </button>
                </div>

                {/* 题干 */}
                <div>
                  <label className={fieldLabel()}>题干</label>
                  <textarea
                    ref={contentRef}
                    className={`${inputClass} text-sm`}
                    rows={5}
                    value={draft.content}
                    onFocus={() => setActiveField('content')}
                    onChange={(e) => setDraft({ ...draft, content: e.target.value })}
                    placeholder="支持 LaTeX：$行内$ 或 $$独立公式$$"
                  />
                </div>

                {/* 选项 */}
                {(isChoice || (draft.options?.length ?? 0) > 0) && (
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <label className={fieldLabel('text-xs font-medium text-slate-400')}>选项</label>
                      <button type="button" className="text-xs text-cyan-400 hover:text-cyan-300" onClick={addOption}>
                        + 添加选项
                      </button>
                    </div>
                    <div className="space-y-2">
                      {(draft.options ?? []).map((opt, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <span className="w-6 shrink-0 text-sm text-slate-500">
                            {OPTION_LABELS[idx] || String.fromCharCode(65 + idx)}.
                          </span>
                          <input
                            ref={(el) => { optionRefs.current[idx] = el }}
                            className={`${inputClass} flex-1 text-sm py-2`}
                            value={opt}
                            onFocus={() => setActiveField(`option-${idx}`)}
                            onChange={(e) => {
                              const options = [...(draft.options ?? [])]
                              options[idx] = e.target.value
                              setDraft({ ...draft, options })
                            }}
                          />
                          <button
                            type="button"
                            className="shrink-0 text-xs text-red-400 hover:text-red-300"
                            onClick={() => removeOption(idx)}
                          >
                            删除
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {!isChoice && (draft.options?.length ?? 0) === 0 && (
                  <button type="button" className="text-xs text-cyan-400 hover:text-cyan-300" onClick={addOption}>
                    + 添加选项（选择题）
                  </button>
                )}

                {/* 答案 */}
                <div>
                  <label className={fieldLabel()}>答案</label>
                  <input
                    ref={answerRef}
                    className={`${inputClass} text-sm py-2`}
                    value={draft.answer}
                    onFocus={() => setActiveField('answer')}
                    onChange={(e) => setDraft({ ...draft, answer: e.target.value })}
                    placeholder="正确答案"
                  />
                </div>

                {/* 解析 */}
                <div>
                  <label className={fieldLabel()}>解析</label>
                  <textarea
                    ref={analysisRef}
                    className={`${inputClass} text-sm`}
                    rows={4}
                    value={draft.analysis}
                    onFocus={() => setActiveField('analysis')}
                    onChange={(e) => setDraft({ ...draft, analysis: e.target.value })}
                    placeholder="题目解析"
                  />
                </div>
              </div>

              {/* 底部按钮 */}
              <div className="flex shrink-0 justify-end gap-2 border-t border-slate-700 p-4">
                <button type="button" className={btnSecondary} onClick={onCancel} disabled={saving}>
                  取消
                </button>
                <button type="button" className={btnPrimary} onClick={() => void handleSave()} disabled={saving}>
                  {saving ? '保存中…' : '保存'}
                </button>
              </div>
            </div>

            {/* 右侧预览区 */}
            <div className="flex w-1/2 flex-col bg-slate-950/50">
              <div className="border-b border-slate-700 px-4 py-2 text-sm font-medium text-slate-300">
                实时预览
              </div>
              <div className="flex-1 overflow-y-auto p-5">
                <div className="mb-3 flex flex-wrap gap-2 text-xs">
                  <span className="rounded border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-blue-300">
                    {draft.question_type}
                  </span>
                  <span className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-amber-300">
                    {draft.difficulty}
                  </span>
                  {draft.knowledge_point && (
                    <span className="rounded border border-slate-600 bg-slate-800 px-2 py-0.5 text-slate-400">
                      {draft.knowledge_point}
                    </span>
                  )}
                </div>

                <div className="mb-4 text-sm leading-relaxed text-slate-200">
                  <MathRenderer text={draft.content || '（题干为空）'} />
                </div>

                {(draft.options ?? []).filter(Boolean).length > 0 && (
                  <div className="mb-4 space-y-2">
                    {(draft.options ?? []).map((opt, idx) => {
                      if (!opt.trim()) return null
                      const label = OPTION_LABELS[idx] || String.fromCharCode(65 + idx)
                      return (
                        <div key={idx} className="flex gap-2 text-sm text-slate-300">
                          <span className="shrink-0 font-medium text-slate-500">{label}.</span>
                          <MathRenderer text={opt} />
                        </div>
                      )
                    })}
                  </div>
                )}

                <div className="mb-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
                  <div className="mb-1 text-xs font-medium text-emerald-400">答案</div>
                  <div className="text-sm text-emerald-200">
                    <MathRenderer text={draft.answer || '暂无'} />
                  </div>
                </div>

                <div className="rounded-lg border border-slate-700 bg-slate-800/40 p-3">
                  <div className="mb-1 text-xs font-medium text-slate-400">解析</div>
                  <div className="text-sm text-slate-300">
                    <MathRenderer text={draft.analysis || '暂无'} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <LatexPanel
        isOpen={latexOpen}
        onClose={() => setLatexOpen(false)}
        onInsert={insertLatex}
        className="z-[60]"
      />

      <GeoGebraBoardModal
        open={geoBoardOpen}
        teacherId={teacherId}
        onInsert={insertImageMarkdown}
        onClose={() => setGeoBoardOpen(false)}
        onError={(msg) => setError(msg)}
      />
    </>
  )
}
