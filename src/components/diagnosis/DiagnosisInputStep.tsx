import { useState } from 'react'
import type { DiagnosisFormData, DiagnosisSubject, ExamType } from '../../types/diagnosis'
import { DIAGNOSIS_SUBJECTS, EXAM_TYPES } from '../../types/diagnosis'
import { compressExamImage, formatFileSize } from '../../lib/imageCompress'

interface Props {
  form: DiagnosisFormData
  onChange: (form: DiagnosisFormData) => void
  onSubmit: () => void
  loading: boolean
}

const inputClass =
  'w-full rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-3 text-white outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30'

export default function DiagnosisInputStep({ form, onChange, onSubmit, loading }: Props) {
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const update = <K extends keyof DiagnosisFormData>(key: K, value: DiagnosisFormData[K]) => {
    onChange({ ...form, [key]: value })
  }

  const handlePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadError(null)
    setUploading(true)

    try {
      if (form.photoPreviewUrl) {
        URL.revokeObjectURL(form.photoPreviewUrl)
      }

      const compressed = await compressExamImage(file)
      onChange({
        ...form,
        photoName: file.name,
        examImageBase64: compressed.base64,
        examImageMimeType: compressed.mimeType,
        photoPreviewUrl: compressed.previewUrl,
        photoSizeBytes: compressed.compressedSize,
      })
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : '图片处理失败')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const clearPhoto = () => {
    if (form.photoPreviewUrl) URL.revokeObjectURL(form.photoPreviewUrl)
    onChange({
      ...form,
      photoName: undefined,
      examImageBase64: undefined,
      examImageMimeType: undefined,
      photoPreviewUrl: undefined,
      photoSizeBytes: undefined,
    })
    setUploadError(null)
  }

  const isBusy = loading || uploading

  return (
    <div className="mx-auto max-w-2xl opacity-0 animate-[fadeIn_0.5s_ease_forwards]">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-blue-100 sm:text-3xl">AI学习诊断</h1>
        <p className="mt-2 text-sm text-slate-400">输入考试信息或上传试卷照片，AI 将生成专属诊断报告</p>
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
          <textarea value={form.confusion} onChange={(e) => update('confusion', e.target.value)} placeholder="请描述你在本次考试中遇到的困惑..." rows={4} className={`${inputClass} resize-y placeholder-slate-500`} />
        </div>

        <div>
          <label className="mb-1.5 block text-sm text-slate-300">上传试卷照片（选填，支持 JPG / PNG / WebP）</label>
          <label className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-4 py-6 text-sm transition ${
            uploading ? 'border-blue-400/50 bg-blue-500/10 text-blue-200' : 'border-slate-600 bg-slate-800/50 text-slate-400 hover:border-blue-500/50 hover:text-blue-300'
          }`}>
            <input
              type="file"
              accept="image/jpeg,image/png,image/jpg,image/webp"
              className="hidden"
              disabled={isBusy}
              onChange={handlePhoto}
            />
            {uploading ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-blue-400/30 border-t-blue-400" />
                正在压缩图片...
              </span>
            ) : form.photoName ? (
              <span>已选择：{form.photoName}{form.photoSizeBytes ? `（${formatFileSize(form.photoSizeBytes)}）` : ''}</span>
            ) : (
              <span>点击上传试卷照片（超过 4MB 将自动压缩）</span>
            )}
          </label>

          {form.photoPreviewUrl && (
            <div className="mt-3 overflow-hidden rounded-xl border border-slate-700">
              <img src={form.photoPreviewUrl} alt="试卷预览" className="max-h-48 w-full object-contain bg-slate-950" />
              <div className="flex justify-end border-t border-slate-700 px-3 py-2">
                <button type="button" onClick={clearPhoto} className="text-xs text-slate-400 hover:text-red-300">
                  移除图片
                </button>
              </div>
            </div>
          )}

          {uploadError && (
            <p className="mt-2 text-sm text-red-300">{uploadError}</p>
          )}
        </div>

        <button
          type="button"
          onClick={onSubmit}
          disabled={isBusy}
          className="w-full rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 py-3.5 text-sm font-semibold text-white shadow-lg shadow-blue-600/30 transition hover:from-blue-500 hover:to-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? '正在上传并分析试卷...' : uploading ? '图片处理中...' : '开始智能诊断'}
        </button>
      </div>
    </div>
  )
}
