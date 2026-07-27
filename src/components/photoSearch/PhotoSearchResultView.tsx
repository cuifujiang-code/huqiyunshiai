import { useState, type ReactNode } from 'react'
import MathRenderer from '../common/MathRenderer'
import { preparePhotoSearchMath } from '../../lib/photoSearchMath'
import { normalizePhotoSearchSections, splitSolutionSteps } from '../../lib/photoSearchFormat'
import type { PhotoSearchResult, SearchStatus } from '../../types/photoSearch'

interface Props {
  result: PhotoSearchResult | null
  searchStatus: SearchStatus
  onAddToMistakeBook?: () => void
  onSimilarQuestions?: () => void
  editedOcrText: string
  onEditOcrText: (text: string) => void
  onReSearch: () => void
  onRetake: () => void
  onReselect: () => void
  onRetry: () => void
  onCancelNetworkError: () => void
  notice?: string | null
}

const STATUS_CONFIG: Record<SearchStatus, { icon: string; label: string; bg: string; text: string }> = {
  success: { icon: '✓', label: '识别成功', bg: 'bg-emerald-500/15', text: 'text-emerald-300' },
  no_match: { icon: '?', label: '未匹配到原题', bg: 'bg-amber-500/15', text: 'text-amber-300' },
  blurry: { icon: '!', label: '无法识别', bg: 'bg-red-500/15', text: 'text-red-300' },
  network_error: { icon: '✕', label: '网络异常', bg: 'bg-red-500/15', text: 'text-red-300' },
}

function SectionCard({
  icon,
  title,
  accent,
  children,
}: {
  icon: string
  title: string
  accent: string
  children: ReactNode
}) {
  return (
    <section className={`rounded-xl border ${accent} bg-slate-950/40 p-4`}>
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/5 text-base">{icon}</span>
        {title}
      </h3>
      {children}
    </section>
  )
}

function MathBlock({ text, className = '' }: { text: string; className?: string }) {
  if (!text?.trim()) return <p className="text-sm italic text-slate-500">暂无内容</p>
  const prepared = preparePhotoSearchMath(text)
  return (
    <MathRenderer
      text={prepared}
      className={`photo-search-math math-renderer text-sm leading-relaxed text-slate-200 ${className}`}
    />
  )
}

function StepSolution({ text }: { text: string }) {
  const steps = splitSolutionSteps(text)
  if (steps.length <= 1) {
    return <MathBlock text={text} />
  }
  return (
    <ol className="space-y-4">
      {steps.map((step, i) => (
        <li key={`step-${i}`} className="flex gap-3">
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-cyan-500/20 text-xs font-bold text-cyan-300">
            {i + 1}
          </span>
          <MathBlock text={step} className="flex-1" />
        </li>
      ))}
    </ol>
  )
}

export default function PhotoSearchResultView({
  result,
  searchStatus,
  onAddToMistakeBook,
  onSimilarQuestions,
  editedOcrText,
  onEditOcrText,
  onReSearch,
  onRetake,
  onReselect,
  onRetry,
  onCancelNetworkError,
  notice,
}: Props) {
  const [showNetworkDialog, setShowNetworkDialog] = useState(true)

  const statusCfg = STATUS_CONFIG[searchStatus]

  if (searchStatus === 'network_error') {
    if (!showNetworkDialog) return null
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
        <div className="mx-4 w-full max-w-sm rounded-2xl border border-red-500/30 bg-slate-900 p-6 shadow-2xl">
          <div className="mb-4 flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500/20 text-xl text-red-400">
              ✕
            </span>
            <div>
              <h3 className="text-base font-semibold text-white">网络连接失败</h3>
              <p className="text-sm text-slate-400">请检查网络连接后重试</p>
            </div>
          </div>
          {notice && <p className="mb-3 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300">{notice}</p>}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => {
                setShowNetworkDialog(false)
                onCancelNetworkError()
              }}
              className="flex-1 rounded-xl border border-slate-600 py-2.5 text-sm text-slate-300 hover:border-slate-500"
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => {
                setShowNetworkDialog(false)
                onRetry()
              }}
              className="flex-1 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 py-2.5 text-sm font-semibold text-white"
            >
              重试
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (searchStatus === 'blurry') {
    return (
      <div className="space-y-5 rounded-2xl border border-red-500/30 bg-red-950/20 p-5">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-red-500/25 text-sm text-red-400">
            !
          </span>
          <p className="text-sm font-medium text-red-300">图片字迹模糊无法识别</p>
        </div>
        <p className="text-sm text-slate-400">
          请确保题目清晰完整、光线充足，避免抖动或遮挡。可尝试重新拍照或从相册选择更清晰的图片。
        </p>
        {notice && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300">{notice}</p>}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onRetake}
            className="flex-1 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-600/25"
          >
            重新拍照
          </button>
          <button
            type="button"
            onClick={onReselect}
            className="flex-1 rounded-xl border border-slate-600 py-2.5 text-sm text-slate-200 hover:border-blue-500/50"
          >
            从相册重选
          </button>
        </div>
      </div>
    )
  }

  if (searchStatus === 'no_match') {
    return (
      <div className="space-y-5 rounded-2xl border border-amber-500/25 bg-slate-900/70 p-5">
        <span className={`inline-flex items-center gap-1.5 rounded-full ${statusCfg.bg} px-3 py-1 text-xs font-medium ${statusCfg.text}`}>
          <span>{statusCfg.icon}</span> {statusCfg.label}
        </span>

        <section>
          <h3 className="text-sm font-medium text-slate-400">识别原文（OCR）</h3>
          <div className="mt-2 rounded-lg bg-slate-950/50 p-3">
            <MathBlock text={result?.ocrText || '—'} />
          </div>
        </section>

        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
          <p className="text-sm font-medium text-amber-200">未搜到原题</p>
          <p className="mt-1 text-xs text-amber-400/80">题库中未找到匹配题目。您可以手动编辑识别文字后再次搜索。</p>
        </div>

        <section>
          <h3 className="text-sm font-medium text-slate-400">手动编辑题干</h3>
          <textarea
            value={editedOcrText}
            onChange={(e) => onEditOcrText(e.target.value)}
            rows={5}
            className="mt-2 w-full resize-y rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-3 text-sm leading-relaxed text-white placeholder-slate-500 focus:border-cyan-500/50 focus:outline-none focus:ring-1 focus:ring-cyan-500/30"
            placeholder="在此编辑题目文字…"
          />
        </section>

        {notice && <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-300">{notice}</p>}

        <button
          type="button"
          onClick={onReSearch}
          disabled={!editedOcrText.trim()}
          className="w-full rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 py-3 text-sm font-semibold text-white disabled:opacity-50 shadow-lg shadow-blue-600/25"
        >
          使用编辑后题干再次搜索
        </button>
      </div>
    )
  }

  if (!result) return null

  const fromBank = result.source === 'bank'
  const sections = normalizePhotoSearchSections(result)

  return (
    <div className="space-y-4 rounded-2xl border border-blue-500/25 bg-slate-900/70 p-5">
      <div className="flex flex-wrap items-center gap-2">
        {fromBank ? (
          <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-medium text-emerald-300">
            题库标准答案
          </span>
        ) : (
          <span className="rounded-full bg-cyan-500/20 px-3 py-1 text-xs font-medium text-cyan-300">AI 智能解答</span>
        )}
        {result.knowledgePoints.slice(0, 3).map((kp) => (
          <span
            key={kp}
            className="rounded-full border border-violet-500/30 bg-violet-500/10 px-2.5 py-0.5 text-[11px] text-violet-200"
          >
            {kp}
          </span>
        ))}
      </div>

      <section className="rounded-xl border border-slate-700/80 bg-slate-950/30 p-4">
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">题目</h3>
        <MathBlock text={result.question} className="text-base text-white" />
      </section>

      <section className="rounded-xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-orange-500/5 p-4">
        <h3 className="mb-2 text-xs font-medium text-amber-300">最终答案</h3>
        <MathBlock text={result.answer} className="text-base font-medium text-amber-50" />
      </section>

      <SectionCard icon="🧠" title="思路分析" accent="border-indigo-500/25">
        <MathBlock text={sections.thinking} />
      </SectionCard>

      <SectionCard icon="📋" title="步骤解答" accent="border-cyan-500/25">
        <StepSolution text={sections.steps} />
      </SectionCard>

      <SectionCard icon="📚" title="知识总结" accent="border-violet-500/25">
        <MathBlock text={sections.knowledgeSummary} />
      </SectionCard>

      <SectionCard icon="🔄" title="同类题型推荐" accent="border-emerald-500/25">
        {sections.similarQuestions.length > 0 ? (
          <ul className="space-y-2">
            {sections.similarQuestions.map((item, i) => (
              <li
                key={`sim-${i}-${item.title.slice(0, 24)}`}
                className="rounded-lg border border-slate-700/60 bg-slate-900/50 px-3 py-2.5"
              >
                <p className="text-sm font-medium text-slate-100">{item.title}</p>
                {item.reason && <p className="mt-1 text-xs text-slate-400">{item.reason}</p>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-400">暂无推荐，可点击底部「同类题练习」获取更多训练题。</p>
        )}
      </SectionCard>

      <details className="rounded-lg border border-slate-800 bg-slate-950/30">
        <summary className="cursor-pointer px-4 py-2.5 text-xs text-slate-500 hover:text-slate-300">
          查看 OCR 识别原文
        </summary>
        <div className="border-t border-slate-800 px-4 py-3">
          <MathBlock text={result.ocrText} className="text-xs text-slate-400" />
        </div>
      </details>

      {result.isMockFallback && (
        <p className="text-xs text-amber-400/90">AI 服务未配置或不可用，仅展示有限结果。</p>
      )}

      {result.ocrFallback && (
        <p className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
          OCR 服务繁忙，已使用备用识别通道
        </p>
      )}

      {notice && <p className="rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">{notice}</p>}

      <div className="flex gap-3 border-t border-slate-700/60 pt-4">
        <button
          type="button"
          onClick={onAddToMistakeBook}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-amber-500/40 bg-amber-500/10 py-2.5 text-sm font-medium text-amber-200 transition hover:bg-amber-500/20"
        >
          加入错题本
        </button>
        <button
          type="button"
          onClick={onSimilarQuestions}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-cyan-500/40 bg-cyan-500/10 py-2.5 text-sm font-medium text-cyan-200 transition hover:bg-cyan-500/20"
        >
          同类题练习
        </button>
      </div>
    </div>
  )
}
