import type { HandoutContent } from '../../types/teacher'
import { btnPrimary, btnSecondary, inputClass } from '../../types/teacher'

const FONT_FAMILIES = [
  { label: '微软雅黑', value: 'Microsoft YaHei' },
  { label: '宋体', value: 'SimSun' },
  { label: '黑体', value: 'SimHei' },
  { label: '楷体', value: 'KaiTi' },
  { label: 'Times', value: 'Times New Roman' },
]

interface Props {
  open: boolean
  onClose: () => void
  onImportJson: (json: Record<string, unknown>) => void
  onImportPdf: (file: File) => Promise<void>
  loading?: boolean
}

export default function HandoutOcrImportModal({ open, onClose, onImportJson, onImportPdf, loading }: Props) {
  if (!open) return null

  const handleJsonFile = async (file: File) => {
    const text = await file.text()
    const json = JSON.parse(text) as Record<string, unknown>
    onImportJson(json)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-xl border border-slate-600 bg-slate-900 p-5 shadow-xl">
        <h3 className="text-lg font-semibold text-white">从 OCR / 手写解析导入</h3>
        <p className="mt-2 text-xs text-slate-400">
          支持 WorkBuddy 导出的 JSON，或手写 PDF（将自动分页 OCR 识别）。
        </p>

        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs text-slate-400">WorkBuddy JSON 文件</span>
            <input
              type="file"
              accept=".json,application/json"
              className={`${inputClass} text-sm`}
              disabled={loading}
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void handleJsonFile(f).catch(() => alert('JSON 解析失败'))
              }}
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs text-slate-400">手写 PDF（最多 15 页）</span>
            <input
              type="file"
              accept=".pdf,application/pdf"
              className={`${inputClass} text-sm`}
              disabled={loading}
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void onImportPdf(f)
              }}
            />
          </label>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className={btnSecondary} onClick={onClose} disabled={loading}>
            关闭
          </button>
          {loading && <span className="text-xs text-cyan-400 self-center">识别中…</span>}
        </div>
      </div>
    </div>
  )
}

export { FONT_FAMILIES }
