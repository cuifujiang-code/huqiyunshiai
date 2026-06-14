import { useRef, useState } from 'react'
import type { QuestionImportResult } from '../lib/teacherApi'
import { btnPrimary, btnSecondary } from '../types/teacher'

interface Props {
  open: boolean
  onClose: () => void
  onImport: (file: File) => Promise<QuestionImportResult>
  loading?: boolean
}

export default function QuestionImportModal({ open, onClose, onImport, loading }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [result, setResult] = useState<QuestionImportResult | null>(null)
  const [error, setError] = useState('')

  if (!open) return null

  const handleFile = async (file: File) => {
    setError('')
    setResult(null)
    try {
      const data = await onImport(file)
      setResult(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : '导入失败')
    } finally {
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const handleClose = () => {
    setResult(null)
    setError('')
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-xl border border-slate-600 bg-slate-900 shadow-xl">
        <div className="shrink-0 border-b border-white/10 p-5">
          <h3 className="text-lg font-semibold text-white">批量导入题目</h3>
          <p className="mt-2 text-xs text-slate-400">
            请使用 Excel 模板填写题目信息，支持 .xlsx / .xls 格式。表头字段：content、answer、analysis、question_type、difficulty、subject、grade 等。
          </p>
          <a
            href="/templates/question-import-template.xlsx"
            download="question-import-template.xlsx"
            className="mt-3 inline-block text-sm text-blue-400 underline hover:text-blue-300"
          >
            下载导入模板
          </a>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <label className="block">
            <span className="mb-2 block text-xs text-slate-400">选择 Excel 文件</span>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              className="block w-full text-sm text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-600 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white hover:file:bg-blue-500"
              disabled={loading}
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void handleFile(f)
              }}
            />
          </label>

          {loading && (
            <p className="mt-4 text-sm text-blue-300">正在解析并导入，请稍候…</p>
          )}

          {error && (
            <p className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p>
          )}

          {result && (
            <div className="mt-4 space-y-3">
              <div className="flex gap-4 text-sm">
                <span className="text-emerald-400">成功：{result.successCount} 条</span>
                <span className="text-amber-400">失败：{result.failureCount} 条</span>
              </div>
              {result.errors.length > 0 && (
                <div className="max-h-48 overflow-y-auto rounded-lg border border-white/10 bg-slate-950/50">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 bg-slate-800 text-slate-400">
                      <tr>
                        <th className="px-3 py-2 font-medium">行号</th>
                        <th className="px-3 py-2 font-medium">错误原因</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.errors.map((item) => (
                        <tr key={`${item.row}-${item.message}`} className="border-t border-white/5">
                          <td className="whitespace-nowrap px-3 py-2 text-slate-300">{item.row || '—'}</td>
                          <td className="px-3 py-2 text-red-300">{item.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-white/10 p-4">
          <button type="button" className={btnSecondary} onClick={handleClose}>
            关闭
          </button>
          {result && result.successCount > 0 && (
            <button type="button" className={btnPrimary} onClick={handleClose}>
              完成
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
