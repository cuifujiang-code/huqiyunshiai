import JSZip from 'jszip'
import { convertDocxToPreviewHtml } from './docxPreview'

const PREVIEWABLE_EXT = new Set(['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'docx', 'txt'])

export interface ZipEntryItem {
  path: string
  name: string
  size: number
  ext: string
  previewable: boolean
}

export type ZipPreviewContent =
  | { type: 'pdf' | 'image'; url: string }
  | { type: 'html'; html: string }
  | { type: 'text'; text: string }
  | { type: 'unsupported' }

function extOf(path: string): string {
  const m = path.match(/\.([a-z0-9]+)$/i)
  return m ? m[1].toLowerCase() : ''
}

function baseName(path: string): string {
  return path.split('/').filter(Boolean).pop() || path
}

export async function fetchAndParseZip(url: string): Promise<{ zip: JSZip; entries: ZipEntryItem[] }> {
  const res = await fetch(url)
  if (!res.ok) throw new Error('无法加载压缩包')
  const buffer = await res.arrayBuffer()
  const zip = await JSZip.loadAsync(buffer)
  const entries: ZipEntryItem[] = []

  zip.forEach((relativePath, file) => {
    if (file.dir) return
    const name = baseName(relativePath)
    if (name.startsWith('.') || name.startsWith('__MACOSX')) return
    const ext = extOf(name)
    entries.push({
      path: relativePath,
      name,
      size: 0,
      ext,
      previewable: PREVIEWABLE_EXT.has(ext),
    })
  })

  entries.sort((a, b) => {
    if (a.previewable !== b.previewable) return a.previewable ? -1 : 1
    return a.path.localeCompare(b.path, 'zh-CN')
  })

  if (!entries.length) throw new Error('压缩包内没有可展示的文件')
  return { zip, entries }
}

export async function extractZipPreview(
  zip: JSZip,
  path: string,
): Promise<ZipPreviewContent> {
  const file = zip.file(path)
  if (!file) throw new Error('文件不存在')
  const ext = extOf(path)

  if (ext === 'pdf') {
    const data = await file.async('uint8array')
    const blob = new Blob([data], { type: 'application/pdf' })
    return { type: 'pdf', url: URL.createObjectURL(blob) }
  }

  if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) {
    const data = await file.async('uint8array')
    const mime =
      ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
      : ext === 'png' ? 'image/png'
      : ext === 'gif' ? 'image/gif'
      : 'image/webp'
    const blob = new Blob([data], { type: mime })
    return { type: 'image', url: URL.createObjectURL(blob) }
  }

  if (ext === 'docx') {
    const arrayBuffer = await file.async('arraybuffer')
    const html = await convertDocxToPreviewHtml(arrayBuffer)
    return { type: 'html', html }
  }

  if (ext === 'txt') {
    const text = await file.async('text')
    return { type: 'text', text }
  }

  return { type: 'unsupported' }
}

export function revokePreviewContent(content: ZipPreviewContent | null) {
  if (!content) return
  if ((content.type === 'pdf' || content.type === 'image') && content.url) {
    URL.revokeObjectURL(content.url)
  }
}
