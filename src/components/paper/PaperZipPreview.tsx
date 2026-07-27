import { useCallback, useEffect, useState } from 'react'
import type { PaperItem } from '../../types/paper'
import {
  extractZipPreview,
  fetchAndParseZip,
  revokePreviewContent,
  type ZipEntryItem,
  type ZipPreviewContent,
} from '../../lib/paperZipPreview'
import type JSZip from 'jszip'
import PaperPdfPreview from './PaperPdfPreview'

interface Props {
  paper: PaperItem
}

export default function PaperZipPreview({ paper }: Props) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [zip, setZip] = useState<JSZip | null>(null)
  const [entries, setEntries] = useState<ZipEntryItem[]>([])
  const [selectedPath, setSelectedPath] = useState('')
  const [preview, setPreview] = useState<ZipPreviewContent | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  const loadEntry = useCallback(async (z: JSZip, path: string) => {
    setPreviewLoading(true)
    setPreview((prev) => {
      revokePreviewContent(prev)
      return null
    })
    try {
      const content = await extractZipPreview(z, path)
      setPreview(content)
    } catch {
      setPreview({ type: 'unsupported' })
    } finally {
      setPreviewLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    setZip(null)
    setEntries([])
    setSelectedPath('')
    setPreview(null)

    fetchAndParseZip(paper.file_url)
      .then(({ zip: z, entries: list }) => {
        if (cancelled) return
        setZip(z)
        setEntries(list)
        const first = list.find((e) => e.previewable) ?? list[0]
        if (first) {
          setSelectedPath(first.path)
          loadEntry(z, first.path)
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : '压缩包解析失败')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [paper.file_url, loadEntry])

  useEffect(() => () => revokePreviewContent(preview), [preview])

  function handleSelect(path: string) {
    if (!zip || path === selectedPath) return
    setSelectedPath(path)
    loadEntry(zip, path)
  }

  if (loading) {
    return <div className="text-[#8A94A9] text-sm">正在解析压缩包…</div>
  }

  if (error) {
    return (
      <div className="text-center text-[#8A94A9]">
        <p className="mb-2 text-red-400/90">{error}</p>
        <p className="text-xs">请尝试下载后本地查看</p>
      </div>
    )
  }

  return (
    <div className="flex h-full w-full max-w-6xl gap-3 min-h-[70vh]">
      <div className="w-56 shrink-0 overflow-y-auto rounded border border-white/[0.08] bg-[#121722] p-2">
        <p className="px-2 py-1 text-[10px] text-[#6B7280]">包内文件 ({entries.length})</p>
        <ul className="space-y-0.5">
          {entries.map((e) => (
            <li key={e.path}>
              <button
                type="button"
                onClick={() => handleSelect(e.path)}
                className={`w-full rounded px-2 py-1.5 text-left text-xs transition truncate ${
                  selectedPath === e.path
                    ? 'bg-[#2584FF]/20 text-[#5C9DFF]'
                    : 'text-[#C8CFDF] hover:bg-white/[0.04]'
                }`}
                title={e.path}
              >
                <span className="uppercase text-[10px] text-[#6B7280] mr-1">{e.ext || '?'}</span>
                {e.name}
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex-1 min-h-0 overflow-auto rounded border border-white/[0.08] bg-[#0a0e14] p-2">
        {previewLoading && (
          <div className="flex h-full min-h-[65vh] items-center justify-center">
            <span className="text-[#8A94A9] text-sm">加载预览…</span>
          </div>
        )}
        {!previewLoading && preview?.type === 'pdf' && (
          <PaperPdfPreview src={preview.url} className="min-h-[65vh]" />
        )}
        {!previewLoading && preview?.type === 'image' && (
          <div className="flex min-h-[65vh] items-center justify-center">
            <img src={preview.url} alt={selectedPath} className="max-w-full max-h-full object-contain" />
          </div>
        )}
        {!previewLoading && preview?.type === 'html' && (
          <div
            className="paper-docx-preview w-full overflow-visible bg-white text-black p-6 rounded text-sm leading-relaxed"
            dangerouslySetInnerHTML={{ __html: preview.html }}
          />
        )}
        {!previewLoading && preview?.type === 'text' && (
          <pre className="w-full min-h-[65vh] overflow-auto text-xs text-[#E8ECF3] p-4 whitespace-pre-wrap">{preview.text}</pre>
        )}
        {!previewLoading && preview?.type === 'unsupported' && (
          <div className="flex min-h-[65vh] items-center justify-center">
            <p className="text-[#8A94A9] text-sm">该文件类型暂不支持在线预览，请下载压缩包后查看</p>
          </div>
        )}
      </div>
    </div>
  )
}
