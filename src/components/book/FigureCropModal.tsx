import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { SourcePageImage } from '../../lib/figureExtract'
import { cropImageRegion, imgTagFromDataUrl } from '../../lib/figureExtract'
import { btnPrimary, btnSecondary } from '../../types/teacher'

interface Props {
  open: boolean
  pages: SourcePageImage[]
  onClose: () => void
  onInsert: (snippet: string) => void
}

type Drag = { x0: number; y0: number; x1: number; y1: number } | null

export default function FigureCropModal({ open, pages, onClose, onInsert }: Props) {
  const [pageIndex, setPageIndex] = useState(0)
  const [drag, setDrag] = useState<Drag>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const imgRef = useRef<HTMLImageElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  const page = pages[pageIndex]

  const normBox = useCallback(() => {
    if (!drag || !imgRef.current) return null
    const img = imgRef.current
    const rect = img.getBoundingClientRect()
    const x0 = Math.min(drag.x0, drag.x1)
    const y0 = Math.min(drag.y0, drag.y1)
    const x1 = Math.max(drag.x0, drag.x1)
    const y1 = Math.max(drag.y0, drag.y1)
    if (x1 - x0 < 8 || y1 - y0 < 8) return null
    return {
      pageIndex,
      x: (x0 - rect.left) / rect.width,
      y: (y0 - rect.top) / rect.height,
      w: (x1 - x0) / rect.width,
      h: (y1 - y0) / rect.height,
    }
  }, [drag, pageIndex])

  const handlePointerDown = (e: ReactPointerEvent) => {
    if (!imgRef.current) return
    const rect = imgRef.current.getBoundingClientRect()
    setDrag({ x0: e.clientX, y0: e.clientY, x1: e.clientX, y1: e.clientY })
    setPreview(null)
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
  }

  const handlePointerMove = (e: ReactPointerEvent) => {
    if (!drag) return
    setDrag({ ...drag, x1: e.clientX, y1: e.clientY })
  }

  const handlePointerUp = async () => {
    const box = normBox()
    if (!box || !page) {
      setDrag(null)
      return
    }
    setBusy(true)
    try {
      const dataUrl = await cropImageRegion(page, box)
      setPreview(dataUrl)
    } finally {
      setBusy(false)
      setDrag(null)
    }
  }

  const handleInsert = () => {
    if (!preview) return
    onInsert(imgTagFromDataUrl(preview))
    setPreview(null)
    onClose()
  }

  if (!open || !pages.length) return null

  const src = page
    ? `data:${page.mimeType || 'image/png'};base64,${page.base64.replace(/^data:[^;]+;base64,/, '')}`
    : ''

  const selectionStyle = (() => {
    if (!drag || !imgRef.current) return null
    const rect = imgRef.current.getBoundingClientRect()
    const wrap = wrapRef.current?.getBoundingClientRect()
    if (!wrap) return null
    const left = Math.min(drag.x0, drag.x1) - wrap.left
    const top = Math.min(drag.y0, drag.y1) - wrap.top
    const width = Math.abs(drag.x1 - drag.x0)
    const height = Math.abs(drag.y1 - drag.y0)
    return { left, top, width, height }
  })()

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4">
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-xl border border-slate-600 bg-slate-900 shadow-2xl">
        <div className="border-b border-slate-700 px-4 py-3">
          <h3 className="text-lg font-semibold text-white">从原图提取图形</h3>
          <p className="mt-1 text-xs text-slate-400">在扫描页上拖拽框选图形区域，直接裁剪插入正文（不经过 OCR 识别）</p>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 px-4 py-2">
          <span className="text-xs text-slate-400">页码</span>
          {pages.map((p, i) => (
            <button
              key={p.name + i}
              type="button"
              className={`rounded px-2 py-1 text-xs ${i === pageIndex ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
              onClick={() => {
                setPageIndex(i)
                setDrag(null)
                setPreview(null)
              }}
            >
              {i + 1}
            </button>
          ))}
        </div>

        <div ref={wrapRef} className="relative flex-1 overflow-auto p-4">
          <div className="relative inline-block max-w-full select-none">
            <img
              ref={imgRef}
              src={src}
              alt={`原图第 ${pageIndex + 1} 页`}
              className="max-h-[55vh] max-w-full cursor-crosshair rounded border border-slate-700"
              draggable={false}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={() => void handlePointerUp()}
            />
            {selectionStyle && (
              <div
                className="pointer-events-none absolute border-2 border-cyan-400 bg-cyan-400/20"
                style={selectionStyle}
              />
            )}
          </div>
          {preview && (
            <div className="mt-4 rounded-lg border border-slate-700 bg-slate-800 p-3">
              <p className="mb-2 text-xs text-slate-400">裁剪预览</p>
              <img src={preview} alt="裁剪预览" className="max-h-40 rounded border border-slate-600" />
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-700 px-4 py-3">
          <button type="button" className={btnSecondary} onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className={btnPrimary}
            disabled={!preview || busy}
            onClick={handleInsert}
          >
            插入到正文
          </button>
        </div>
      </div>
    </div>
  )
}
