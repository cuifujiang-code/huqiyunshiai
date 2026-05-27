import { useCallback, useState } from 'react'
import type {
  AnswerSheetImage,
  DiagnosisFormData,
  DiagnosisSubject,
  ExamFileItem,
  ExamType,
} from '../../types/diagnosis'
import { DIAGNOSIS_SUBJECTS, EXAM_TYPES } from '../../types/diagnosis'
import {
  MAX_ANSWER_SHEET_COUNT,
  TARGET_ANSWER_SHEET_BYTES,
  compressAnswerSheetForUpload,
  fileToBase64,
  formatFileSize,
} from '../../lib/answerSheetCompress'

interface Props {
  form: DiagnosisFormData
  onChange: (form: DiagnosisFormData) => void
  onProceed: () => void
  loading: boolean
}

const inputClass =
  'w-full rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-3 text-white outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30'

const MAX_EXAM_FILE_BYTES = 6 * 1024 * 1024

function createImageId() {
  return `as-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function getExamFileType(name: string): 'docx' | 'pdf' | null {
  const lower = name.toLowerCase()
  if (lower.endsWith('.docx')) return 'docx'
  if (lower.endsWith('.pdf')) return 'pdf'
  return null
}

export default function DiagnosisInputStep({ form, onChange, onProceed, loading }: Props) {
  const [uploading, setUploading] = useState(false)
  const [compressHint, setCompressHint] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [examDragOver, setExamDragOver] = useState(false)
  const [sheetDragOver, setSheetDragOver] = useState(false)
  const [examPreviewOpen, setExamPreviewOpen] = useState(false)

  const answerImages = form.answerSheetImages ?? []
  const hasExam = Boolean(form.examFile)
  const hasSheets = answerImages.length > 0
  const canProceed = hasExam && hasSheets

  const update = <K extends keyof DiagnosisFormData>(key: K, value: DiagnosisFormData[K]) => {
    onChange({ ...form, [key]: value })
  }

  const processExamFile = async (file: File) => {
    const type = getExamFileType(file.name)
    if (!type) throw new Error('标准试卷仅支持 .docx 和 .pdf 格式')
    if (file.size > MAX_EXAM_FILE_BYTES) {
      throw new Error(`试卷文件不能超过 ${formatFileSize(MAX_EXAM_FILE_BYTES)}`)
    }
    const base64 = await fileToBase64(file)
    const item: ExamFileItem = {
      name: file.name,
      type,
      sizeBytes: file.size,
      base64,
    }
    onChange({
      ...form,
      examFile: item,
      examPaperText: undefined,
      answerSheetOcrText: undefined,
      ocrIncomplete: undefined,
    })
  }

  const processAnswerFiles = async (files: File[]) => {
    const remaining = MAX_ANSWER_SHEET_COUNT - answerImages.length
    if (remaining <= 0) throw new Error(`答题卡最多上传 ${MAX_ANSWER_SHEET_COUNT} 张`)

    const toAdd = files.slice(0, remaining)
    const newItems: AnswerSheetImage[] = []

    for (const raw of toAdd) {
      if (!raw.type.startsWith('image/')) {
        throw new Error(`「${raw.name}」不是图片文件`)
      }
      setCompressHint('正在优化图片以加快识别速度...')
      const file = await compressAnswerSheetForUpload(raw)
      setCompressHint(null)
      const base64 = await fileToBase64(file)
      newItems.push({
        id: createImageId(),
        name: raw.name,
        base64,
        mimeType: file.type || 'image/jpeg',
        previewUrl: URL.createObjectURL(file),
        sizeBytes: file.size,
      })
    }

    onChange({
      ...form,
      answerSheetImages: [...answerImages, ...newItems],
      answerSheetOcrText: undefined,
      ocrIncomplete: undefined,
    })
  }

  const handleExamInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadError(null)
    setUploading(true)
    try {
      await processExamFile(file)
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : '试卷上传失败')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const handleAnswerInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    setUploadError(null)
    setUploading(true)
    try {
      await processAnswerFiles(files)
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : '答题卡上传失败')
    } finally {
      setCompressHint(null)
      setUploading(false)
      e.target.value = ''
    }
  }

  const onExamDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault()
      setExamDragOver(false)
      const file = e.dataTransfer.files?.[0]
      if (!file) return
      setUploadError(null)
      setUploading(true)
      try {
        await processExamFile(file)
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : '试卷上传失败')
      } finally {
        setUploading(false)
      }
    },
    [form],
  )

  const onSheetDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault()
      setSheetDragOver(false)
      const files = Array.from(e.dataTransfer.files ?? []).filter((f) => f.type.startsWith('image/'))
      if (!files.length) return
      setUploadError(null)
      setUploading(true)
      try {
        await processAnswerFiles(files)
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : '答题卡上传失败')
      } finally {
        setUploading(false)
      }
    },
    [form, answerImages],
  )

  const removeAnswerImage = (id: string) => {
    const target = answerImages.find((img) => img.id === id)
    if (target) URL.revokeObjectURL(target.previewUrl)
    onChange({
      ...form,
      answerSheetImages: answerImages.filter((img) => img.id !== id),
    })
  }

  const clearExam = () => {
    onChange({ ...form, examFile: null, examPaperText: undefined })
  }

  const isBusy = loading || uploading

  return (
    <div className="mx-auto max-w-2xl opacity-0 animate-[fadeIn_0.5s_ease_forwards]">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-blue-100 sm:text-3xl">AI 精准对比诊断</h1>
        <p className="mt-2 text-sm text-slate-400">
          上传标准试卷（Word/PDF）+ 学生手写答题卡，AI 将逐题对比分析
        </p>
      </div>

      <div className="space-y-5 rounded-2xl border border-blue-500/20 bg-slate-900/60 p-5 sm:p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm text-slate-300">考试类型</label>
            <select value={form.examType} onChange={(e) => update('examType', e.target.value as ExamType)} className={inputClass}>
              {EXAM_TYPES.map((t) => (<option key={t} value={t}>{t}</option>))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm text-slate-300">学科</label>
            <select value={form.subject} onChange={(e) => update('subject', e.target.value as DiagnosisSubject)} className={inputClass}>
              {DIAGNOSIS_SUBJECTS.map((s) => (<option key={s} value={s}>{s}</option>))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1.5 block text-sm text-slate-300">考试分数</label>
            <input type="number" min={0} max={form.fullScore} value={form.score} onChange={(e) => update('score', Number(e.target.value))} className={inputClass} />
          </div>
          <div>
            <label className="mb-1.5 block text-sm text-slate-300">满分</label>
            <input type="number" min={1} value={form.fullScore} onChange={(e) => update('fullScore', Number(e.target.value))} className={inputClass} />
          </div>
          <div>
            <label className="mb-1.5 block text-sm text-slate-300">年级排名（选填）</label>
            <input type="number" min={1} value={form.gradeRank ?? ''} onChange={(e) => update('gradeRank', e.target.value ? Number(e.target.value) : undefined)} placeholder="如：128" className={`${inputClass} placeholder-slate-500`} />
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-sm text-slate-300">考试困惑（选填）</label>
          <textarea value={form.confusion} onChange={(e) => update('confusion', e.target.value)} rows={3} className={`${inputClass} resize-y placeholder-slate-500`} placeholder="描述本次考试的困惑..." />
        </div>

        {/* 标准试卷 */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-blue-200">① 标准试卷（Word / PDF）</label>
          <div
            onDragOver={(e) => { e.preventDefault(); setExamDragOver(true) }}
            onDragLeave={() => setExamDragOver(false)}
            onDrop={onExamDrop}
            className={`rounded-xl border border-dashed px-4 py-6 text-center text-sm transition ${
              examDragOver ? 'border-blue-400 bg-blue-500/10 text-blue-200' : 'border-slate-600 bg-slate-800/50 text-slate-400'
            }`}
          >
            <input type="file" accept=".docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="hidden" id="exam-file-input" disabled={isBusy} onChange={handleExamInput} />
            <label htmlFor="exam-file-input" className="cursor-pointer">
              {form.examFile ? (
                <span className="text-slate-200">
                  已选择：{form.examFile.name}（{formatFileSize(form.examFile.sizeBytes)}）
                </span>
              ) : (
                <span>拖拽或点击上传 .docx / .pdf 标准试卷</span>
              )}
            </label>
          </div>
          {form.examFile && (
            <div className="mt-2 flex items-center justify-between">
              <button type="button" onClick={() => setExamPreviewOpen(!examPreviewOpen)} className="text-xs text-blue-300 hover:text-blue-200">
                {examPreviewOpen ? '收起' : '展开'}本地预览说明
              </button>
              <button type="button" onClick={clearExam} className="text-xs text-slate-400 hover:text-red-300">移除试卷</button>
            </div>
          )}
          {examPreviewOpen && form.examFile && (
            <p className="mt-2 rounded-lg border border-slate-700 bg-slate-950/80 px-3 py-2 text-xs text-slate-500">
              上传后将由服务端解析为纯文本，作为「参考答案」与答题卡 OCR 结果对比。
            </p>
          )}
        </div>

        {/* 答题卡 */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-cyan-200">
            ② 学生手写答题卡（图片，最多 {MAX_ANSWER_SHEET_COUNT} 张）
          </label>
          <div
            onDragOver={(e) => { e.preventDefault(); setSheetDragOver(true) }}
            onDragLeave={() => setSheetDragOver(false)}
            onDrop={onSheetDrop}
            className={`rounded-xl border border-dashed px-4 py-6 text-center text-sm transition ${
              sheetDragOver ? 'border-cyan-400 bg-cyan-500/10 text-cyan-200' : 'border-slate-600 bg-slate-800/50 text-slate-400'
            } ${answerImages.length >= MAX_ANSWER_SHEET_COUNT ? 'opacity-50' : ''}`}
          >
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              id="answer-sheet-input"
              disabled={isBusy || answerImages.length >= MAX_ANSWER_SHEET_COUNT}
              onChange={handleAnswerInput}
            />
            <label htmlFor="answer-sheet-input" className={`cursor-pointer ${answerImages.length >= MAX_ANSWER_SHEET_COUNT ? 'pointer-events-none' : ''}`}>
              {compressHint
                ? compressHint
                : uploading
                  ? '处理中...'
                  : answerImages.length >= MAX_ANSWER_SHEET_COUNT
                    ? '已达上传上限'
                    : `拖拽或点击上传答题卡（自动压缩至 ${formatFileSize(TARGET_ANSWER_SHEET_BYTES)} 以内）`}
            </label>
          </div>

          {hasSheets && (
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {answerImages.map((img, i) => (
                <div key={img.id} className="group relative overflow-hidden rounded-xl border border-slate-700">
                  <img src={img.previewUrl} alt={`答题卡${i + 1}`} className="h-28 w-full object-cover" />
                  <button type="button" onClick={() => removeAnswerImage(img.id)} className="absolute right-1 top-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-red-300 opacity-0 group-hover:opacity-100">删除</button>
                  <p className="truncate px-2 py-1 text-[10px] text-slate-500">第{i + 1}张 · {formatFileSize(img.sizeBytes)}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {uploadError && <p className="text-sm text-red-300">{uploadError}</p>}

        <button
          type="button"
          onClick={onProceed}
          disabled={isBusy || !canProceed}
          className="w-full rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 py-3.5 text-sm font-semibold text-white shadow-lg shadow-blue-600/30 hover:from-blue-500 hover:to-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? '处理中...' : uploading ? '上传处理中...' : '开始对比诊断'}
        </button>
        {!canProceed && !isBusy && (
          <p className="text-center text-xs text-slate-500">请同时上传标准试卷和至少一张答题卡</p>
        )}
      </div>
    </div>
  )
}
