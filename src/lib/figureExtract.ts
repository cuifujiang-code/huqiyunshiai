/** 辅导书 OCR 图形区域 — 从原图页直接裁剪嵌入 */

import type { BookChapter } from '../types/teacher'

export interface SourcePageImage {
  name: string
  base64: string
  mimeType?: string
}

export interface FigureBox {
  pageIndex: number
  x: number
  y: number
  w: number
  h: number
}

const FIGURE_MARKER_RE =
  /\[FIGURE(?::(\d+))?(?::([\d.]+),([\d.]+),([\d.]+),([\d.]+))?(?:\s+page=(\d+)\s+x=([\d.]+)\s+y=([\d.]+)\s+w=([\d.]+)\s+h=([\d.]+))?\]/gi

const FIGURE_TEXT_RE = /\[图形[^\]]*\]/g

function pageSrc(page: SourcePageImage): string {
  const mime = page.mimeType || 'image/png'
  const raw = page.base64.replace(/^data:[^;]+;base64,/, '')
  return `data:${mime};base64,${raw}`
}

/** 从原图页按归一化坐标 (0~1) 裁剪区域，返回 data URL */
export function cropImageRegion(page: SourcePageImage, box: FigureBox): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const sx = Math.max(0, Math.min(1, box.x)) * img.naturalWidth
      const sy = Math.max(0, Math.min(1, box.y)) * img.naturalHeight
      const sw = Math.max(8, Math.min(img.naturalWidth - sx, box.w * img.naturalWidth))
      const sh = Math.max(8, Math.min(img.naturalHeight - sy, box.h * img.naturalHeight))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(sw)
      canvas.height = Math.round(sh)
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('无法创建画布'))
        return
      }
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh)
      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = () => reject(new Error('原图加载失败'))
    img.src = pageSrc(page)
  })
}

function parseMarkerMatch(m: RegExpExecArray): FigureBox | null {
  const pageIndex = Number(m[1] ?? m[6] ?? 1) - 1
  const x = Number(m[2] ?? m[7])
  const y = Number(m[3] ?? m[8])
  const w = Number(m[4] ?? m[9])
  const h = Number(m[5] ?? m[10])
  if (![x, y, w, h].every((n) => Number.isFinite(n) && n >= 0 && n <= 1)) return null
  if (w < 0.02 || h < 0.02) return null
  return { pageIndex, x, y, w, h }
}

/** 将文本中的 [FIGURE:...] 标记替换为 <img> 裁剪图 */
export async function replaceFigureMarkersInText(
  text: string,
  pages: SourcePageImage[],
): Promise<string> {
  if (!text?.trim() || !pages.length) return text

  const parts: string[] = []
  let last = 0
  let m: RegExpExecArray | null
  FIGURE_MARKER_RE.lastIndex = 0

  while ((m = FIGURE_MARKER_RE.exec(text)) !== null) {
    parts.push(text.slice(last, m.index))
    const box = parseMarkerMatch(m)
    const page = box ? pages[box.pageIndex] ?? pages[0] : null
    if (box && page) {
      try {
        const dataUrl = await cropImageRegion(page, box)
        parts.push(`\n<img src="${dataUrl}" alt="图形" class="book-figure max-w-full h-auto my-2" />\n`)
      } catch {
        parts.push(m[0])
      }
    } else {
      parts.push(m[0])
    }
    last = m.index + m[0].length
  }
  parts.push(text.slice(last))
  return parts.join('').replace(FIGURE_TEXT_RE, '\n[图片占位符]\n')
}

/** 批量处理所有章节块中的图形标记 */
export async function embedFiguresInChapters(
  chapters: BookChapter[],
  pages: SourcePageImage[],
): Promise<BookChapter[]> {
  if (!pages.length) return chapters
  const next = structuredClone(chapters) as BookChapter[]
  for (const ch of next) {
    for (const sec of ch.sections) {
      for (const block of sec.blocks) {
        if (block.content.includes('[FIGURE') || block.content.includes('[图形')) {
          block.content = await replaceFigureMarkersInText(block.content, pages)
        }
      }
    }
  }
  return next
}

export function imgTagFromDataUrl(dataUrl: string, alt = '图形'): string {
  return `\n<img src="${dataUrl}" alt="${alt}" class="book-figure max-w-full h-auto my-2" />\n`
}
