/**
 * WMF/EMF 公式图 → PNG data URL（浏览器预览）
 */
import type { DocxFormulaImage } from './docxFormulaExtract'

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

export async function wmfEmfBase64ToPngDataUrl(
  b64: string,
  format: string,
  maxWidth = 1400,
): Promise<string | null> {
  if (!b64) return null
  const fmt = format.toLowerCase()
  if (fmt === 'png' || fmt === 'jpg' || fmt === 'jpeg' || fmt === 'gif' || fmt === 'webp') {
    const mime = fmt === 'jpg' ? 'image/jpeg' : `image/${fmt}`
    return `data:${mime};base64,${b64}`
  }
  try {
    const { convertEmfToDataUrl, convertWmfToDataUrl } = await import('emf-converter')
    const buf = base64ToArrayBuffer(b64)
    if (fmt === 'emf') return await convertEmfToDataUrl(buf, maxWidth)
    return await convertWmfToDataUrl(buf, maxWidth)
  } catch {
    return null
  }
}

export interface ConvertedFormulaImage extends DocxFormulaImage {
  pngDataUrl: string | null
}

export async function convertFormulaImages(
  images: Omit<DocxFormulaImage, 'index'>[],
): Promise<ConvertedFormulaImage[]> {
  return Promise.all(
    images.map(async (img, index) => {
      const maxW = img.inline ? 600 : 1400
      const pngDataUrl = await wmfEmfBase64ToPngDataUrl(img.base64, img.format, maxW)
      return { ...img, index, pngDataUrl }
    }),
  )
}

export function formulaImageTag(img: ConvertedFormulaImage): string {
  if (!img.pngDataUrl) return ''
  const cls = img.inline
    ? 'paper-docx-formula paper-docx-formula-inline'
    : 'paper-docx-formula'
  const w = img.width && img.width !== 'auto' ? ` width="${img.width.replace(/"/g, '')}"` : ''
  const h = img.height && img.height !== 'auto' ? ` height="${img.height.replace(/"/g, '')}"` : ''
  return `<img class="${cls}" src="${img.pngDataUrl}" alt="公式"${w}${h} loading="lazy" />`
}
