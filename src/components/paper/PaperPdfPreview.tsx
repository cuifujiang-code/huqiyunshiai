import { useEffect, useRef, useState } from 'react'
import { pdfToImages, type PdfPageImage } from '../../utils/pdfTools'

interface Props {
  /** blob: URL 或远程 PDF 地址 */
  src: string
  className?: string
}

export default function PaperPdfPreview({ src, className = '' }: Props) {
  const [pages, setPages] = useState<PdfPageImage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [totalPages, setTotalPages] = useState(0)
  const pagesRef = useRef<PdfPageImage[]>([])

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()

    async function load() {
      setLoading(true)
      setError('')
      setPages([])
      pagesRef.current.forEach((p) => URL.revokeObjectURL(p.objectUrl))
      pagesRef.current = []

      try {
        const res = await fetch(src, { signal: controller.signal })
        if (!res.ok) throw new Error('无法加载 PDF')
        const buf = await res.arrayBuffer()
        const blob = new Blob([buf], { type: 'application/pdf' })
        const result = await pdfToImages(blob, {
          scale: 1.6,
          maxPages: 50,
          format: 'png',
          signal: controller.signal,
        })
        if (cancelled) {
          result.pages.forEach((p) => URL.revokeObjectURL(p.objectUrl))
          return
        }
        pagesRef.current = result.pages
        setPages(result.pages)
        setTotalPages(result.totalPages)
      } catch (e) {
        if (cancelled || (e instanceof DOMException && e.name === 'AbortError')) return
        setError(e instanceof Error ? e.message : 'PDF 解析失败')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
      controller.abort()
      pagesRef.current.forEach((p) => URL.revokeObjectURL(p.objectUrl))
      pagesRef.current = []
    }
  }, [src])

  if (loading) {
    return <div className={`text-[#8A94A9] text-sm ${className}`}>正在渲染 PDF…</div>
  }

  if (error) {
    return (
      <div className={`text-center text-[#8A94A9] ${className}`}>
        <p className="text-red-400/90 mb-2">{error}</p>
        <p className="text-xs">请下载后本地查看</p>
      </div>
    )
  }

  return (
    <div className={`w-full overflow-auto ${className}`}>
      {totalPages > pages.length && (
        <p className="mb-3 text-center text-xs text-[#6B7280]">
          预览前 {pages.length} 页（共 {totalPages} 页）
        </p>
      )}
      <div className="mx-auto max-w-4xl space-y-4 pb-6">
        {pages.map((p) => (
          <img
            key={p.pageNumber}
            src={p.objectUrl}
            alt={`第 ${p.pageNumber} 页`}
            className="block w-full rounded border border-gray-200 bg-white shadow-sm"
            loading="lazy"
          />
        ))}
      </div>
    </div>
  )
}
