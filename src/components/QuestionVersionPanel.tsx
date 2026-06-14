import { useEffect, useState } from 'react'
import MathRenderer from './common/MathRenderer'
import { fetchQuestionVersions, restoreQuestionVersion } from '../lib/teacherApi'
import type { BankQuestion, QuestionVersion } from '../types/teacher'
import { btnPrimary, btnSecondary } from '../types/teacher'

interface Props {
  open: boolean
  questionId: string
  teacherId: string
  onClose: () => void
  onRestored: (question: BankQuestion) => void
}

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleString('zh-CN', { hour12: false })
  } catch {
    return iso
  }
}

export default function QuestionVersionPanel({
  open,
  questionId,
  teacherId,
  onClose,
  onRestored,
}: Props) {
  const [versions, setVersions] = useState<QuestionVersion[]>([])
  const [loading, setLoading] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<QuestionVersion | null>(null)

  useEffect(() => {
    if (!open || !questionId) return
    setLoading(true)
    setError('')
    void fetchQuestionVersions(teacherId, questionId)
      .then((items) => {
        setVersions(items)
        setSelected(items[0] ?? null)
      })
      .catch((e) => setError(e instanceof Error ? e.message : '加载失败'))
      .finally(() => setLoading(false))
  }, [open, questionId, teacherId])

  const handleRestore = async () => {
    if (!selected) return
    if (!window.confirm(`确定恢复到版本 v${selected.version_number}？当前内容会先存档再替换。`)) return
    setRestoring(true)
    setError('')
    try {
      const question = await restoreQuestionVersion(teacherId, questionId, selected.id)
      onRestored(question)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : '恢复失败')
    } finally {
      setRestoring(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4">
      <div className="flex h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-slate-600 bg-slate-900 shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-700 px-5 py-3">
          <h4 className="text-base font-semibold text-white">历史版本</h4>
          <button type="button" className="text-slate-400 hover:text-white" onClick={onClose}>✕</button>
        </div>

        {error && (
          <p className="mx-5 mt-3 shrink-0 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>
        )}

        <div className="flex min-h-0 flex-1">
          <div className="w-56 shrink-0 overflow-y-auto border-r border-slate-700 p-3">
            {loading && <p className="text-xs text-slate-500">加载中…</p>}
            {!loading && versions.length === 0 && (
              <p className="text-xs text-slate-500">暂无历史版本（首次保存后将自动记录）</p>
            )}
            {versions.map((v) => (
              <button
                key={v.id}
                type="button"
                className={`mb-2 w-full rounded-lg border px-3 py-2 text-left text-xs transition ${
                  selected?.id === v.id
                    ? 'border-blue-500/40 bg-blue-500/10 text-blue-200'
                    : 'border-slate-700 bg-slate-800/50 text-slate-300 hover:border-slate-600'
                }`}
                onClick={() => setSelected(v)}
              >
                <div className="font-medium">v{v.version_number}</div>
                <div className="mt-1 text-slate-500">{formatTime(v.created_at)}</div>
              </button>
            ))}
          </div>

          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {selected ? (
                <>
                  <div>
                    <div className="mb-1 text-xs font-medium text-slate-400">题干</div>
                    <div className="rounded-lg border border-slate-700 bg-slate-950/40 p-3 text-sm">
                      <MathRenderer text={selected.content || '（空）'} />
                    </div>
                  </div>
                  <div>
                    <div className="mb-1 text-xs font-medium text-emerald-400">答案</div>
                    <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-sm">
                      <MathRenderer text={selected.answer || '（空）'} />
                    </div>
                  </div>
                  <div>
                    <div className="mb-1 text-xs font-medium text-slate-400">解析</div>
                    <div className="rounded-lg border border-slate-700 bg-slate-800/40 p-3 text-sm">
                      <MathRenderer text={selected.analysis || '（空）'} />
                    </div>
                  </div>
                </>
              ) : (
                !loading && <p className="text-sm text-slate-500">选择左侧版本查看内容</p>
              )}
            </div>
            <div className="flex shrink-0 justify-end gap-2 border-t border-slate-700 p-4">
              <button type="button" className={btnSecondary} onClick={onClose}>关闭</button>
              <button
                type="button"
                className={btnPrimary}
                disabled={!selected || restoring}
                onClick={() => void handleRestore()}
              >
                {restoring ? '恢复中…' : '恢复此版本'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
