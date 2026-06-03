import { useState } from 'react'
import type { PhotoSearchResult, SearchStatus } from '../../types/photoSearch'

interface Props {
  result: PhotoSearchResult | null
  searchStatus: SearchStatus
  /** 成功状态 — 加入错题本 */
  onAddToMistakeBook?: () => void
  /** 成功状态 — 同类题练习 */
  onSimilarQuestions?: () => void
  /** no_match — 编辑题干文本 */
  editedOcrText: string
  onEditOcrText: (text: string) => void
  /** no_match — 用编辑后的题干重新搜索 */
  onReSearch: () => void
  /** blurry — 重新拍照 */
  onRetake: () => void
  /** blurry — 从相册重选 */
  onReselect: () => void
  /** network_error — 重试 */
  onRetry: () => void
  /** network_error — 取消 */
  onCancelNetworkError: () => void
  /** 通知消息 */
  notice?: string | null
}

/** 状态标签配置 */
const STATUS_CONFIG: Record<SearchStatus, { icon: string; label: string; bg: string; text: string }> = {
  success: { icon: '✓', label: '识别成功', bg: 'bg-emerald-500/15', text: 'text-emerald-300' },
  no_match: { icon: '?', label: '未匹配到原题', bg: 'bg-amber-500/15', text: 'text-amber-300' },
  blurry: { icon: '!', label: '无法识别', bg: 'bg-red-500/15', text: 'text-red-300' },
  network_error: { icon: '✕', label: '网络异常', bg: 'bg-red-500/15', text: 'text-red-300' },
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

  // ==================== State 4: Network Error Dialog ====================
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

  // ==================== State 3: Blurry / OCR Failed ====================
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

  // ==================== State 2: No Match ====================
  if (searchStatus === 'no_match') {
    return (
      <div className="space-y-5 rounded-2xl border border-amber-500/25 bg-slate-900/70 p-5">
        {/* Status badge */}
        <span className={`inline-flex items-center gap-1.5 rounded-full ${statusCfg.bg} px-3 py-1 text-xs font-medium ${statusCfg.text}`}>
          <span>{statusCfg.icon}</span> {statusCfg.label}
        </span>

        {/* OCR 原文 */}
        <section>
          <h3 className="text-sm font-medium text-slate-400">识别原文（OCR）</h3>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-300">
            {result?.ocrText || '—'}
          </p>
        </section>

        {/* 未搜到原题提示 */}
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
          <p className="text-sm font-medium text-amber-200">未搜到原题</p>
          <p className="mt-1 text-xs text-amber-400/80">
            题库中未找到匹配题目，AI 服务暂时不可用。您可以手动编辑识别文字后再次搜索。
          </p>
        </div>

        {/* 编辑题干文本框 */}
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

        {notice && (
          <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-300">{notice}</p>
        )}

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

  // ==================== State 1: Success ====================
  if (!result) return null

  const fromBank = result.source === 'bank'

  return (
    <div className="space-y-5 rounded-2xl border border-blue-500/25 bg-slate-900/70 p-5">
      {/* Status badge */}
      {fromBank && (
        <span className="inline-block rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-medium text-emerald-300">
          题库标准答案
        </span>
      )}
      {!fromBank && result.source === 'ai' && !result.isMockFallback && (
        <span className="inline-block rounded-full bg-cyan-500/20 px-3 py-1 text-xs font-medium text-cyan-300">
          AI 智能解答
        </span>
      )}

      {/* OCR 原文 */}
      <section>
        <h3 className="text-sm font-medium text-slate-400">识别原文（OCR）</h3>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-300">{result.ocrText}</p>
      </section>

      {/* 原题 */}
      <section>
        <h3 className="text-sm font-medium text-blue-200">原题</h3>
        <p className="mt-2 whitespace-pre-wrap text-base leading-relaxed text-white">{result.question}</p>
      </section>

      {/* 答案 */}
      <section>
        <h3 className="text-sm font-medium text-amber-200">答案</h3>
        <p className="mt-2 whitespace-pre-wrap text-base leading-relaxed text-amber-50/95">{result.answer}</p>
      </section>

      {/* 解析 */}
      <section>
        <h3 className="text-sm font-medium text-cyan-200">解析</h3>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-200">{result.analysis || '暂无解析'}</p>
      </section>

      {/* 知识点 */}
      {result.knowledgePoints.length > 0 && (
        <section>
          <h3 className="text-sm font-medium text-violet-200">相关知识点</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {result.knowledgePoints.map((kp) => (
              <span
                key={kp}
                className="rounded-lg border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-sm text-violet-200"
              >
                {kp}
              </span>
            ))}
          </div>
        </section>
      )}

      {result.isMockFallback && (
        <p className="text-xs text-amber-400/90">AI 服务未配置或不可用，仅展示有限结果。</p>
      )}

      {notice && (
        <p className="rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">{notice}</p>
      )}

      {/* 底部操作按钮 */}
      <div className="flex gap-3 border-t border-slate-700/60 pt-4">
        <button
          type="button"
          onClick={onAddToMistakeBook}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-amber-500/40 bg-amber-500/10 py-2.5 text-sm font-medium text-amber-200 transition hover:bg-amber-500/20"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m0 0l-6-6m6 6l6-6" />
          </svg>
          加入错题本
        </button>
        <button
          type="button"
          onClick={onSimilarQuestions}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-cyan-500/40 bg-cyan-500/10 py-2.5 text-sm font-medium text-cyan-200 transition hover:bg-cyan-500/20"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          同类题练习
        </button>
      </div>
    </div>
  )
}
