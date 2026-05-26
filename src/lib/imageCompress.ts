/** Vercel 请求体上限约 4.5MB，JSON 中 base64 需预留余量 */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024
export const TARGET_BASE64_BYTES = 3 * 1024 * 1024

const ACCEPTED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'] as const

export type AcceptedImageMime = (typeof ACCEPTED_TYPES)[number]

export function isAcceptedImageType(type: string): type is AcceptedImageMime {
  return ACCEPTED_TYPES.includes(type as AcceptedImageMime)
}

export interface CompressedImage {
  base64: string
  mimeType: AcceptedImageMime
  originalSize: number
  compressedSize: number
  previewUrl: string
  width: number
  height: number
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('读取图片失败'))
    reader.readAsDataURL(file)
  })
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('图片格式无效或已损坏'))
    img.src = src
  })
}

function estimateBase64Bytes(base64: string) {
  return Math.ceil((base64.length * 3) / 4)
}

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: AcceptedImageMime, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('图片压缩失败'))),
      mimeType,
      quality,
    )
  })
}

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result)
      const comma = result.indexOf(',')
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.onerror = () => reject(new Error('转换 Base64 失败'))
    reader.readAsDataURL(blob)
  })
}

/**
 * 压缩图片至适合 API 传输的大小（目标 < 3MB base64）
 */
export async function compressExamImage(file: File): Promise<CompressedImage> {
  if (!isAcceptedImageType(file.type)) {
    throw new Error('仅支持 JPG、PNG、WebP 格式')
  }

  if (file.size > 15 * 1024 * 1024) {
    throw new Error('图片过大，请选择 15MB 以内的试卷照片')
  }

  const dataUrl = await readFileAsDataUrl(file)
  const img = await loadImage(dataUrl)

  const outputMime: AcceptedImageMime = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
  let quality = 0.88
  let scale = 1
  let base64 = ''
  let blob: Blob | null = null

  for (let attempt = 0; attempt < 8; attempt++) {
    const canvas = document.createElement('canvas')
    const w = Math.max(1, Math.round(img.width * scale))
    const h = Math.max(1, Math.round(img.height * scale))
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('无法创建画布')
    ctx.drawImage(img, 0, 0, w, h)

    blob = await canvasToBlob(canvas, outputMime, quality)
    base64 = await blobToBase64(blob)

    if (estimateBase64Bytes(base64) <= TARGET_BASE64_BYTES) break

    if (quality > 0.5) {
      quality -= 0.12
    } else {
      scale *= 0.82
      quality = 0.82
    }
  }

  if (!blob || !base64) throw new Error('图片压缩失败')

  if (estimateBase64Bytes(base64) > MAX_UPLOAD_BYTES) {
    throw new Error('图片压缩后仍超过 4MB，请裁剪或更换更小的照片')
  }

  const previewUrl = URL.createObjectURL(blob)

  return {
    base64,
    mimeType: outputMime,
    originalSize: file.size,
    compressedSize: blob.size,
    previewUrl,
    width: Math.round(img.width * scale),
    height: Math.round(img.height * scale),
  }
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}
