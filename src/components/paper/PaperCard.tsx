import type { PaperItem } from '../../types/paper'

interface Props {
  paper: PaperItem
  isTeacher: boolean
  onPreview: () => void
  onDownload: () => void
  onCollect: () => void
  onEdit?: () => void
  onDelete?: () => void
}

export default function PaperCard({
  paper: p,
  isTeacher,
  onPreview,
  onDownload,
  onCollect,
  onEdit,
  onDelete,
}: Props) {
  const levelColor: Record<string, string> = {
    精品: 'bg-amber-500/15 text-amber-300 border-amber-500/25',
    免费: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25',
    特供: 'bg-violet-500/15 text-violet-300 border-violet-500/25',
    教辅: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/25',
  }

  return (
    <div className="rounded-[10px] border border-white/[0.08] bg-[#1a2030] p-4 transition hover:border-[#2584FF]/30">
      <div className="flex gap-4 flex-wrap">
        <div className="flex flex-col gap-1.5 shrink-0 w-20">
          <span className={`rounded px-2 py-0.5 text-[10px] border text-center ${levelColor[p.level] || 'bg-white/[0.04] text-[#8A94A9] border-white/[0.06]'}`}>
            {p.level || '普通'}
          </span>
          <span className="rounded px-2 py-0.5 text-[10px] bg-white/[0.04] text-[#8A94A9] border border-white/[0.06] text-center uppercase">
            {p.file_type}
          </span>
          {p.set_type === 'set' && (
            <span className="rounded px-2 py-0.5 text-[10px] bg-[#2584FF]/10 text-[#5C9DFF] border border-[#2584FF]/20 text-center">成套</span>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-[#E8ECF3] leading-snug mb-1 line-clamp-2">{p.title}</h3>
          <div className="flex flex-wrap gap-2 text-[11px] text-[#8A94A9] mb-2">
            {p.subject && <span className="text-[#5C9DFF]">{p.subject}</span>}
            {p.exam_year && <span>{p.exam_year}年</span>}
            {p.term && p.term !== '无' && <span>{p.term}</span>}
            {p.grade && <span>{p.grade}</span>}
            {p.area && <span>{p.area}</span>}
            {p.page_count > 0 && <span>{p.page_count}页</span>}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {p.has_answer && <span className="rounded px-1.5 py-0.5 text-[10px] bg-emerald-500/10 text-emerald-300">含答案</span>}
            {p.has_analysis && <span className="rounded px-1.5 py-0.5 text-[10px] bg-sky-500/10 text-sky-300">含解析</span>}
            <span className="text-[10px] text-[#6B7394]">浏览 {p.view_count} · 下载 {p.download_count}</span>
          </div>
        </div>

        <div className="flex flex-col gap-2 shrink-0 justify-center">
          <button type="button" className="rounded-[6px] bg-[#2584FF] px-4 py-1.5 text-xs font-medium text-white hover:bg-[#1a6fe0]" onClick={onPreview}>
            查看
          </button>
          <button
            type="button"
            className={`rounded-[6px] border px-3 py-1.5 text-xs transition ${p.collected ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' : 'border-white/[0.08] text-[#C8CFDF] hover:bg-white/[0.04]'}`}
            onClick={onCollect}
          >
            {p.collected ? '已收藏' : '+ 加入资源篮'}
          </button>
          <button type="button" className="rounded-[6px] border border-white/[0.08] px-3 py-1 text-[11px] text-[#8A94A9] hover:text-[#E8ECF3]" onClick={onDownload}>
            下载
          </button>
          {isTeacher && p.upload_user_id && (
            <div className="flex gap-1">
              {onEdit && (
                <button type="button" className="text-[11px] text-[#8A94A9] hover:text-[#5C9DFF]" onClick={onEdit}>编辑</button>
              )}
              {onDelete && (
                <button type="button" className="text-[11px] text-red-400/80 hover:text-red-400" onClick={onDelete}>删除</button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
