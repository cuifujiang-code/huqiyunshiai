import { btnPrimary, btnSecondary } from '../../types/teacher'
import type { BookDocxCleanStats } from '../../lib/bookDocxClean'
import { buildCleanResultMessage } from '../../lib/bookDocxClean'

interface Props {
  open: boolean
  stats: BookDocxCleanStats
  summary?: string
  onClose: () => void
  onManualClean?: () => void
  manualCleanLoading?: boolean
}

export default function BookDocxCleanResultModal({
  open,
  stats,
  summary,
  onClose,
  onManualClean,
  manualCleanLoading,
}: Props) {
  if (!open) return null

  const message = summary || buildCleanResultMessage(stats)
  const manyImageFormulas = (stats.imageFormulasKept || 0) > 30

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-xl border border-emerald-500/30 bg-slate-900 p-5 shadow-xl">
        <h3 className="text-lg font-semibold text-emerald-300">导入清洗完成</h3>
        <p className="mt-3 text-sm leading-relaxed text-slate-200">{message}</p>

        <ul className="mt-4 space-y-1.5 text-xs text-slate-400">
          <li>· 水印/广告过滤：{stats.watermarksRemoved ?? 0} 处</li>
          <li>· 公式转 LaTeX：{(stats.ommlConverted ?? 0) + (stats.formulasConverted ?? 0)} 个</li>
          <li>· 段落规整：{stats.paragraphsNormalized ?? 0} 处</li>
          {(stats.imageFormulasKept ?? 0) > 0 && (
            <li>· 保留图片公式：{stats.imageFormulasKept} 个</li>
          )}
        </ul>

        {manyImageFormulas && (
          <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            部分公式为图片格式，可手动重新录入 LaTeX 优化显示
          </p>
        )}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          {onManualClean && (
            <button
              type="button"
              className={btnSecondary}
              disabled={manualCleanLoading}
              onClick={onManualClean}
            >
              {manualCleanLoading ? '清洗中…' : '手动清洗'}
            </button>
          )}
          <button type="button" className={btnPrimary} onClick={onClose}>
            进入预览
          </button>
        </div>
      </div>
    </div>
  )
}
