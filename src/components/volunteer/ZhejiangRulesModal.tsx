import { useEffect, useState } from 'react'
import { fetchZhejiangRules } from '../../lib/volunteerApi'
import type { ZhejiangRulesSection, ZhejiangRulesSummary } from '../../types/volunteer'

interface ZhejiangRulesModalProps {
  open: boolean
  onClose: () => void
}

export default function ZhejiangRulesModal({ open, onClose }: ZhejiangRulesModalProps) {
  const [summary, setSummary] = useState<ZhejiangRulesSummary | null>(null)
  const [sections, setSections] = useState<ZhejiangRulesSection[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    fetchZhejiangRules()
      .then((res) => {
        if (res.success) {
          setSummary(res.summary ?? null)
          setSections(res.sections ?? [])
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [open])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-600/60 bg-slate-900 p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="zj-rules-title"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 id="zj-rules-title" className="text-lg font-semibold text-blue-100">
              浙江高考投档规则说明
            </h2>
            <p className="mt-1 text-xs text-slate-400">普通类「专业+学校」平行志愿</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-800 hover:text-white"
            aria-label="关闭"
          >
            ✕
          </button>
        </div>

        {loading ? (
          <p className="text-sm text-slate-400">加载中…</p>
        ) : (
          <>
            {summary && (
              <dl className="mb-5 grid gap-2 rounded-xl border border-slate-700/60 bg-slate-800/40 p-4 text-sm">
                <div>
                  <dt className="text-xs text-slate-500">填报模式</dt>
                  <dd className="text-slate-200">{summary.mode}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">选考制度</dt>
                  <dd className="text-slate-200">{summary.elective}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">批次说明</dt>
                  <dd className="text-slate-200">{summary.batchNote}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">推荐依据</dt>
                  <dd className="text-slate-200">{summary.rankFirst}</dd>
                </div>
              </dl>
            )}
            <div className="space-y-4">
              {sections.map((sec) => (
                <section key={sec.title}>
                  <h3 className="mb-1 text-sm font-medium text-cyan-300">{sec.title}</h3>
                  <p className="text-sm leading-relaxed text-slate-300">{sec.content}</p>
                </section>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
