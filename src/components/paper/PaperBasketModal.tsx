import type { PaperItem } from '../../types/paper'

interface Props {
  open: boolean
  items: PaperItem[]
  onClose: () => void
  onRemove: (id: string) => void
  onDownloadAll: () => void
}

export default function PaperBasketModal({ open, items, onClose, onRemove, onDownloadAll }: Props) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md max-h-[80vh] overflow-hidden rounded-[12px] border border-white/[0.08] bg-[#1a2030] shadow-xl flex flex-col">
        <div className="flex items-center justify-between border-b border-white/[0.04] px-4 py-3">
          <h2 className="text-base font-medium text-[#E8ECF3]">资源篮 ({items.length})</h2>
          <button type="button" className="text-[#8A94A9] hover:text-[#E8ECF3]" onClick={onClose}>×</button>
        </div>
        <ul className="flex-1 overflow-y-auto divide-y divide-white/[0.04]">
          {items.length === 0 ? (
            <li className="p-6 text-center text-sm text-[#8A94A9]">暂无收藏试卷</li>
          ) : (
            items.map((p) => (
              <li key={p.id} className="flex items-center gap-2 px-4 py-3">
                <span className="flex-1 text-sm text-[#E8ECF3] truncate">{p.title}</span>
                <button type="button" className="text-xs text-red-400/80 hover:text-red-400 shrink-0" onClick={() => onRemove(p.id)}>
                  移除
                </button>
              </li>
            ))
          )}
        </ul>
        {items.length > 0 && (
          <div className="border-t border-white/[0.04] p-4">
            <button type="button" className="w-full rounded bg-[#2584FF] py-2 text-sm font-medium text-white hover:bg-[#1a6fe0]" onClick={onDownloadAll}>
              批量下载
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
