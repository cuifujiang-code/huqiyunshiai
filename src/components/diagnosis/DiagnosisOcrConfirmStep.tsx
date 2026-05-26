import type { DiagnosisFormData } from '../../types/diagnosis'

interface Props {
  form: DiagnosisFormData
  ocrText: string
  ocrIncomplete: boolean
  onOcrTextChange: (text: string) => void
  onConfirm: () => void
  onReupload: () => void
  loading: boolean
}

export default function DiagnosisOcrConfirmStep({
  form,
  ocrText,
  ocrIncomplete,
  onOcrTextChange,
  onConfirm,
  onReupload,
  loading,
}: Props) {
  const images = form.examImages ?? []

  return (
    <div className="mx-auto max-w-2xl opacity-0 animate-[fadeIn_0.5s_ease_forwards]">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-blue-100 sm:text-3xl">确认识别内容</h1>
        <p className="mt-2 text-sm text-slate-400">
          请核对 OCR 识别到的试卷文字，如有错漏可直接修改，确认无误后再开始 AI 诊断
        </p>
      </div>

      {ocrIncomplete && (
        <div className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          识别内容可能不完整或无法辨认，诊断报告将标注「基于不完整的 OCR 结果，仅供参考」。建议重新上传更清晰的图片。
        </div>
      )}

      {images.length > 0 && (
        <div className="mb-4">
          <p className="mb-2 text-sm text-slate-300">已上传 {images.length} 张试卷图片</p>
          <div className="flex flex-wrap gap-2">
            {images.map((img) => (
              <div
                key={img.id}
                className="overflow-hidden rounded-lg border border-slate-700 bg-slate-950"
              >
                <img
                  src={img.previewUrl}
                  alt={img.name}
                  className="h-20 w-20 object-cover"
                  title={img.name}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-blue-500/20 bg-slate-900/60 p-5 sm:p-6">
        <label className="mb-2 block text-sm font-medium text-slate-300">OCR 识别结果（可编辑）</label>
        <textarea
          value={ocrText}
          onChange={(e) => onOcrTextChange(e.target.value)}
          rows={14}
          className="w-full rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-3 font-mono text-sm leading-relaxed text-slate-200 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
          placeholder="未能识别到文字内容，请重新上传更清晰的试卷图片..."
        />
        <p className="mt-2 text-xs text-slate-500">
          共 {ocrText.length} 字符 · AI 将仅基于上述文字内容进行分析，不会直接「看」图片
        </p>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={onReupload}
            disabled={loading}
            className="flex-1 rounded-xl border border-slate-600 py-3 text-sm font-medium text-slate-300 transition hover:border-slate-500 hover:text-white disabled:opacity-60"
          >
            重新上传图片
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading || !ocrText.trim()}
            className="flex-1 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/30 transition hover:from-blue-500 hover:to-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? '正在生成诊断报告...' : '确认无误，开始诊断'}
          </button>
        </div>
      </div>
    </div>
  )
}
