import { useState } from 'react'
import type { DiagnosisFormData } from '../../types/diagnosis'

interface Props {
  form: DiagnosisFormData
  examPaperText: string
  answerSheetOcrText: string
  ocrIncomplete: boolean
  onExamPaperTextChange: (text: string) => void
  onAnswerSheetOcrTextChange: (text: string) => void
  onConfirm: () => void
  onReupload: () => void
  loading: boolean
}

export default function DiagnosisCompareConfirmStep({
  form,
  examPaperText,
  answerSheetOcrText,
  ocrIncomplete,
  onExamPaperTextChange,
  onAnswerSheetOcrTextChange,
  onConfirm,
  onReupload,
  loading,
}: Props) {
  const [examExpanded, setExamExpanded] = useState(true)
  const [ocrExpanded, setOcrExpanded] = useState(true)
  const images = form.answerSheetImages ?? []

  return (
    <div className="mx-auto max-w-2xl opacity-0 animate-[fadeIn_0.5s_ease_forwards]">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-blue-100 sm:text-3xl">确认对比内容</h1>
        <p className="mt-2 text-sm text-slate-400">
          请核对标准试卷解析文本与答题卡 OCR 结果，确认无误后开始 AI 逐题对比诊断
        </p>
      </div>

      {ocrIncomplete && (
        <div className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          答题卡 OCR 可能不完整，报告将标注「基于不完整的 OCR 结果，仅供参考」。建议重新上传更清晰的答题卡照片。
        </div>
      )}

      {form.examFile && (
        <p className="mb-3 text-sm text-slate-400">
          标准试卷：<span className="text-slate-200">{form.examFile.name}</span>
          {images.length > 0 && (
            <span className="ml-3">答题卡：{images.length} 张</span>
          )}
        </p>
      )}

      <div className="space-y-4 rounded-2xl border border-blue-500/20 bg-slate-900/60 p-5 sm:p-6">
        <div>
          <button
            type="button"
            onClick={() => setExamExpanded(!examExpanded)}
            className="mb-2 flex w-full items-center justify-between text-sm font-medium text-slate-300"
          >
            <span>标准试卷解析文本（可编辑）</span>
            <span className="text-xs text-slate-500">{examExpanded ? '收起' : '展开'} · {examPaperText.length} 字</span>
          </button>
          {examExpanded && (
            <textarea
              value={examPaperText}
              onChange={(e) => onExamPaperTextChange(e.target.value)}
              rows={8}
              className="w-full rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-3 font-mono text-sm text-slate-200 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
            />
          )}
        </div>

        <div>
          <button
            type="button"
            onClick={() => setOcrExpanded(!ocrExpanded)}
            className="mb-2 flex w-full items-center justify-between text-sm font-medium text-slate-300"
          >
            <span>答题卡 OCR 识别结果（可编辑）</span>
            <span className="text-xs text-slate-500">{ocrExpanded ? '收起' : '展开'} · {answerSheetOcrText.length} 字</span>
          </button>
          {ocrExpanded && (
            <textarea
              value={answerSheetOcrText}
              onChange={(e) => onAnswerSheetOcrTextChange(e.target.value)}
              rows={10}
              className="w-full rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-3 font-mono text-sm text-slate-200 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
            />
          )}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={onReupload}
            disabled={loading}
            className="flex-1 rounded-xl border border-slate-600 py-3 text-sm font-medium text-slate-300 hover:border-slate-500 hover:text-white disabled:opacity-60"
          >
            重新上传
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading || !examPaperText.trim() || !answerSheetOcrText.trim()}
            className="flex-1 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/30 hover:from-blue-500 hover:to-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? '正在AI对比分析...' : '确认无误，开始对比诊断'}
          </button>
        </div>
      </div>
    </div>
  )
}
