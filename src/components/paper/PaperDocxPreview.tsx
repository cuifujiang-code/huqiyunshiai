import { useEffect, useState } from 'react'
import type { PaperItem } from '../../types/paper'
import { convertDocxToPreviewHtml } from '../../lib/docxPreview'

interface Props {
  paper: PaperItem
}

export default function PaperDocxPreview({ paper }: Props) {
  const [html, setHtml] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    fetch(paper.file_url)
      .then((r) => {
        if (!r.ok) throw new Error('无法加载文档')
        return r.arrayBuffer()
      })
      .then((buf) => convertDocxToPreviewHtml(buf))
      .then((h) => {
        if (!cancelled) setHtml(h)
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : '文档解析失败')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [paper.file_url])

  if (loading) return <div className="text-[#8A94A9] text-sm">正在加载 Word 文档…</div>
  if (error) {
    return (
      <div className="text-center text-[#8A94A9]">
        <p className="text-red-400/90 mb-2">{error}</p>
        <p className="text-xs">请下载后使用 Word 查看完整版式</p>
      </div>
    )
  }

  return (
    <div
      className="paper-docx-preview w-full max-w-4xl overflow-visible bg-white text-black p-6 rounded text-sm leading-relaxed"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
