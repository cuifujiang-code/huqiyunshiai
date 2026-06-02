import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { fileToBase64 } from '../lib/fileBase64'
import { loadGeoGebraDeploy, type GeoGebraApi } from '../lib/geogebraLoader'
import { uploadQuestionImage } from '../lib/teacherApi'
import { btnPrimary, btnSecondary } from '../types/teacher'
import { svgStringToFile } from '../utils/svgCompress'

export interface GeoGebraBoardModalProps {
  open: boolean
  teacherId: string
  onInsert: (url: string) => void
  onClose: () => void
  onError?: (message: string) => void
}

export default function GeoGebraBoardModal({
  open,
  teacherId,
  onInsert,
  onClose,
  onError,
}: GeoGebraBoardModalProps) {
  const containerId = useId().replace(/:/g, '')
  const containerRef = useRef<HTMLDivElement>(null)
  const apiRef = useRef<GeoGebraApi | null>(null)
  const [loading, setLoading] = useState(true)
  const [inserting, setInserting] = useState(false)

  useEffect(() => {
    if (!open) return

    let mounted = true
    apiRef.current = null
    setLoading(true)

    const init = async () => {
      try {
        await loadGeoGebraDeploy()
        if (!mounted || !containerRef.current || !window.GGBApplet) return

        containerRef.current.innerHTML = ''

        const width = containerRef.current.clientWidth || 800
        const height = Math.max(containerRef.current.clientHeight || 480, 400)

        const params = {
          appName: 'graphing',
          width,
          height,
          showToolBar: true,
          showAlgebraInput: true,
          showMenuBar: false,
          enableRightClick: true,
          errorDialogs: 'silent',
          id: `ggb-${containerId}`,
          appletOnLoad(ggbApi: GeoGebraApi) {
            if (!mounted) return
            apiRef.current = ggbApi
            setLoading(false)
          },
        }

        const applet = new window.GGBApplet(params, true)
        applet.inject(containerRef.current)
      } catch (e) {
        if (!mounted) return
        setLoading(false)
        onError?.(e instanceof Error ? e.message : 'GeoGebra 加载失败')
      }
    }

    void init()

    return () => {
      mounted = false
      apiRef.current = null
      if (containerRef.current) containerRef.current.innerHTML = ''
    }
  }, [open, containerId, onError])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !inserting) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, inserting, onClose])

  const handleInsert = useCallback(async () => {
    const api = apiRef.current
    if (!api) {
      onError?.('画板尚未就绪，请稍候')
      return
    }

    setInserting(true)
    api.exportSVG(async (svg) => {
      if (!svg) {
        setInserting(false)
        onError?.('导出 SVG 失败，请确认当前为 2D 图形视图')
        return
      }

      try {
        const file = svgStringToFile(svg, `geogebra-${Date.now()}.svg`)
        const base64 = await fileToBase64(file)
        const url = await uploadQuestionImage(teacherId, base64, file.name, file.type)
        onInsert(url)
        onClose()
      } catch (e) {
        onError?.(e instanceof Error ? e.message : '几何图上传失败')
      } finally {
        setInserting(false)
      }
    })
  }, [teacherId, onInsert, onClose, onError])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div className="flex h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-600 bg-slate-900 shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-700 px-4 py-3">
          <div>
            <h3 className="text-base font-semibold text-white">几何画板</h3>
            <p className="text-xs text-slate-400">GeoGebra 图形编辑器 · 插入后仅保存 SVG 图片链接</p>
          </div>
          <button
            type="button"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
            onClick={onClose}
            disabled={inserting}
          >
            ✕
          </button>
        </div>

        <div className="relative min-h-0 flex-1 bg-white">
          {loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-900/60 text-sm text-slate-200">
              正在加载 GeoGebra…
            </div>
          )}
          <div
            id={containerId}
            ref={containerRef}
            className="h-full w-full"
          />
        </div>

        <div className="flex shrink-0 items-center justify-end gap-3 border-t border-slate-700 bg-slate-900 px-4 py-3">
          <button type="button" className={btnSecondary} onClick={onClose} disabled={inserting}>
            取消关闭
          </button>
          <button type="button" className={btnPrimary} onClick={() => void handleInsert()} disabled={loading || inserting}>
            {inserting ? '插入中…' : '插入题目'}
          </button>
        </div>
      </div>
    </div>
  )
}
