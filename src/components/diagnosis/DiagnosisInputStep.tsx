import { useState } from 'react'
import type { DiagnosisFormData, DiagnosisSubject, ExamImageItem, ExamType } from '../../types/diagnosis'
import { DIAGNOSIS_SUBJECTS, EXAM_TYPES } from '../../types/diagnosis'
import {
  MAX_EXAM_IMAGES,
  MAX_TOTAL_IMAGES_BYTES,
  compressExamImage,
  formatFileSize,
  getTotalImageBytes,
  revokeExamImageUrls,
} from '../../lib/imageCompress'

interface Props {
  form: DiagnosisFormData
  onChange: (form: DiagnosisFormData) => void
  /** 无图片时直接诊断；有图片时先 OCR */
  onProceed: () => void
  loading: boolean
}

const inputClass =
  'w-full rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-3 text-white outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30'

function createImageId() {
  return `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export default function DiagnosisInputStep({ form, onChange, onProceed, loading }: Props) {
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const images = form.examImages ?? []
  const hasImages = images.length > 0
  const totalBytes = getTotalImageBytes(images)

  const update = <K extends keyof DiagnosisFormData>(key: K, value: DiagnosisFormData[K]) => {
    onChange({ ...form, [key]: value })
  }

  const handlePhotos = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0) return

    setUploadError(null)

    const remaining = MAX_EXAM_IMAGES - images.length
    if (remaining <= 0) {
      setUploadError(`最多上传 ${MAX_EXAM_IMAGES} 张图片`)
      e.target.value = ''
      return
    }

    const toAdd = files.slice(0, remaining)
    if (files.length > remaining) {
      setUploadError(`最多 ${MAX_EXAM_IMAGES} 张，已忽略多余的 ${files.length - remaining} 张`)
    }

    setUploading(true)
    const newItems: ExamImageItem[] = []

    try {
      let runningTotal = totalBytes

      for (const file of toAdd) {
        const compressed = await compressExamImage(file)
        if (runningTotal + compressed.compressedSize > MAX_TOTAL_IMAGES_BYTES) {
          URL.revokeObjectURL(compressed.previewUrl)
          throw new Error(
            `总大小将超过 ${formatFileSize(MAX_TOTAL_IMAGES_BYTES)}，请删除部分图片或上传更小的照片`,
          )
        }
        runningTotal += compressed.compressedSize
        newItems.push({
          id: createImageId(),
          name: file.name,
          base64: compressed.base64,
          mimeType: compressed.mimeType,
          previewUrl: compressed.previewUrl,
          sizeBytes: compressed.compressedSize,
        })
      }

      onChange({
        ...form,
        examImages: [...images, ...newItems],
        ocrText: undefined,
        ocrIncomplete: undefined,
      })
    } catch (err) {
      revokeExamImageUrls(newItems)
      setUploadError(err instanceof Error ? err.message : '图片处理失败')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const removeImage = (id: string) => {
    const target = images.find((img) => img.id === id)
    if (target) URL.revokeObjectURL(target.previewUrl)
    onChange({
      ...form,
      examImages: images.filter((img) => img.id !== id),
      ocrText: undefined,
      ocrIncomplete: undefined,
    })
    setUploadError(null)
  }

  const clearAllPhotos = () => {
    revokeExamImageUrls(images)
    onChange({
      ...form,
      examImages: [],
      ocrText: undefined,
      ocrIncomplete: undefined,
    })
    setUploadError(null)
  }

  const isBusy = loading || uploading

  return (
    <div className="mx-auto max-w-2xl opacity-0 animate-[fadeIn_0.5s_ease_forwards]">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-blue-100 sm:text-3xl">AI学习诊断</h1>
        <p className="mt-2 text-sm text-slate-400">
          输入考试信息并上传试卷照片（最多 {MAX_EXAM_IMAGES} 张），系统将 OCR 识别后生成精准诊断
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
          <textarea value={form.confusion} onChange={(e) => update('confusion', e.target.value)} placeholder="请描述你在本次考试中遇到的困惑..." rows={4} className={`${inputClass} resize-y placeholder-slate-500`} />
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="text-sm text-slate-300">
              上传试卷照片（选填，最多 {MAX_EXAM_IMAGES} 张）
            </label>
            {hasImages && (
              <span className="text-xs text-slate-500">
                {images.length} 张 · {formatFileSize(totalBytes)}
              </span>
            )}
          </div>

          <label className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-4 py-6 text-sm transition ${
            uploading ? 'border-blue-400/50 bg-blue-500/10 text-blue-200' : 'border-slate-600 bg-slate-800/50 text-slate-400 hover:border-blue-500/50 hover:text-blue-300'
          } ${images.length >= MAX_EXAM_IMAGES ? 'pointer-events-none opacity-50' : ''}`}>
            <input
              type="file"
              accept="image/jpeg,image/png,image/jpg,image/webp"
              className="hidden"
              disabled={isBusy || images.length >= MAX_EXAM_IMAGES}
              multiple
              onChange={handlePhotos}
            />
            {uploading ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-blue-400/30 border-t-blue-400" />
                正在压缩图片...
              </span>
            ) : images.length >= MAX_EXAM_IMAGES ? (
              <span>已达 {MAX_EXAM_IMAGES} 张上限</span>
            ) : (
              <span>点击选择试卷图片（可多选，单张超过 2MB 自动压缩）</span>
            )}
          </label>

          {hasImages && (
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {images.map((img, index) => (
                <div key={img.id} className="group relative overflow-hidden rounded-xl border border-slate-700 bg-slate-950">
                  <img
                    src={img.previewUrl}
                    alt={`试卷第 ${index + 1} 页`}
                    className="h-28 w-full object-cover"
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2 py-1.5">
                    <p className="truncate text-[10px] text-slate-300">第 {index + 1} 页</p>
                    <p className="truncate text-[10px] text-slate-500">{formatFileSize(img.sizeBytes)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeImage(img.id)}
                    className="absolute right-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-red-300 opacity-0 transition group-hover:opacity-100"
                  >
                    删除
                  </button>
                </div>
              ))}
            </div>
          )}

          {hasImages && (
            <div className="mt-2 flex justify-end">
              <button type="button" onClick={clearAllPhotos} className="text-xs text-slate-400 hover:text-red-300">
                清空全部图片
              </button>
            </div>
          )}

          {uploadError && (
            <p className="mt-2 text-sm text-red-300">{uploadError}</p>
          )}
        </div>

        <button
          type="button"
          onClick={onProceed}
          disabled={isBusy}
          className="w-full rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 py-3.5 text-sm font-semibold text-white shadow-lg shadow-blue-600/30 transition hover:from-blue-500 hover:to-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading
            ? '处理中...'
            : uploading
              ? '图片处理中...'
              : hasImages
                ? '识别试卷文字'
                : '开始智能诊断'}
        </button>
      </div>
    </div>
  )
}
