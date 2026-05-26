/** Vercel 请求体上限约 4.5MB */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024
/** 单张图片压缩目标（2MB） */
export const MAX_SINGLE_IMAGE_BYTES = 2 * 1024 * 1024
/** 多张图片总大小上限（留余量给 JSON 字段） */
export const MAX_TOTAL_IMAGES_BYTES = 4 * 1024 * 1024
/** 最多上传张数 */
export const MAX_EXAM_IMAGES = 5

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
 * 压缩单张图片至指定大小（默认 2MB）
 */
export async function compressExamImage(
  file: File,
  targetBytes: number = MAX_SINGLE_IMAGE_BYTES,
): Promise<CompressedImage> {
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

  for (let attempt = 0; attempt < 10; attempt++) {
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

    if (blob.size <= targetBytes && estimateBase64Bytes(base64) <= targetBytes) break

    if (quality > 0.45) {
      quality -= 0.1
    } else {
      scale *= 0.8
      quality = 0.75
    }
  }

  if (!blob || !base64) throw new Error('图片压缩失败')

  if (blob.size > MAX_SINGLE_IMAGE_BYTES) {
    throw new Error(`「${file.name}」压缩后仍超过 2MB，请裁剪或更换更小的照片`)
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

export function getTotalImageBytes(images: { sizeBytes: number }[]) {
  return images.reduce((sum, img) => sum + img.sizeBytes, 0)
}

export function revokeExamImageUrls(images: { previewUrl: string }[]) {
  for (const img of images) {
    URL.revokeObjectURL(img.previewUrl)
  }
}
