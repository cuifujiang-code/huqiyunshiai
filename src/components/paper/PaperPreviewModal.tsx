import type { PaperItem } from '../../types/paper'
import PaperZipPreview from './PaperZipPreview'
import PaperDocxPreview from './PaperDocxPreview'
import PaperPdfPreview from './PaperPdfPreview'

interface Props {
  paper: PaperItem | null
  onClose: () => void
  onDownload: () => void
}

export default function PaperPreviewModal({ paper, onClose, onDownload }: Props) {
  if (!paper) return null

  const isPdf = paper.file_type === 'pdf'
  const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(paper.file_type)
  const isZip = paper.file_type === 'zip'
  const isDocx = paper.file_type === 'docx' || paper.file_type === 'doc'

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/80">
      <div className="flex items-center justify-between border-b border-white/[0.08] bg-[#121722] px-4 py-3">
        <h2 className="text-sm font-medium text-[#E8ECF3] truncate flex-1 mr-4">{paper.title}</h2>
        <div className="flex gap-2 shrink-0">
          <button type="button" className="rounded px-3 py-1.5 text-xs text-[#5C9DFF] border border-[#2584FF]/30 hover:bg-[#2584FF]/10" onClick={onDownload}>
            下载
          </button>
          <button type="button" className="rounded px-3 py-1.5 text-xs text-[#8A94A9] hover:text-[#E8ECF3]" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
      <div className={`flex-1 overflow-auto flex items-center justify-center p-4 bg-[#0a0e14] ${isZip || isDocx ? 'items-stretch' : ''}`}>
        {isPdf && (
          <PaperPdfPreview src={paper.file_url} className="w-full max-w-5xl min-h-[70vh]" />
        )}
        {isImage && (
          <img src={paper.file_url} alt={paper.title} className="max-w-full max-h-full object-contain rounded shadow-lg" />
        )}
        {isZip && <PaperZipPreview paper={paper} />}
        {isDocx && <PaperDocxPreview paper={paper} />}
        {!isPdf && !isImage && !isZip && !isDocx && (
          <div className="text-center text-[#8A94A9]">
            <p className="mb-4">该格式暂不支持在线预览，请下载后查看</p>
            <button type="button" className="rounded bg-[#2584FF] px-6 py-2 text-sm text-white" onClick={onDownload}>
              下载原文件
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
