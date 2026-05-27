import Compressor from 'compressorjs'

/** 答题卡上传前压缩目标：500KB 以内 */
export const TARGET_ANSWER_SHEET_BYTES = 500 * 1024
/** @deprecated 使用 TARGET_ANSWER_SHEET_BYTES */
export const MAX_ANSWER_SHEET_BYTES = TARGET_ANSWER_SHEET_BYTES
export const MAX_ANSWER_SHEET_COUNT = 5

/**
 * 上传前自动压缩答题卡图片至 500KB 以内（quality 0.7）
 */
export async function compressAnswerSheetForUpload(file: File): Promise<File> {
  return new Promise((resolve, reject) => {
    new Compressor(file, {
      quality: 0.7,
      maxWidth: 2000,
      maxHeight: 2000,
      convertSize: TARGET_ANSWER_SHEET_BYTES,
      success: (result) => resolve(result as File),
      error: (err) => reject(err instanceof Error ? err : new Error('图片压缩失败')),
    })
  })
}

/** @deprecated 使用 compressAnswerSheetForUpload */
export async function compressAnswerSheetIfNeeded(file: File): Promise<File> {
  return compressAnswerSheetForUpload(file)
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result)
      const comma = result.indexOf(',')
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.onerror = () => reject(new Error('读取文件失败'))
    reader.readAsDataURL(file)
  })
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

export function revokePreviewUrls(images: { previewUrl: string }[]) {
  for (const img of images) {
    URL.revokeObjectURL(img.previewUrl)
  }
}
