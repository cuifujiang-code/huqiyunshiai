import Compressor from 'compressorjs'

/** 单张答题卡超过 4MB 时用 compressorjs 压缩 */
export const MAX_ANSWER_SHEET_BYTES = 4 * 1024 * 1024
export const MAX_ANSWER_SHEET_COUNT = 5

export async function compressAnswerSheetIfNeeded(file: File): Promise<File> {
  if (file.size <= MAX_ANSWER_SHEET_BYTES) return file

  return new Promise((resolve, reject) => {
    new Compressor(file, {
      quality: 0.75,
      maxWidth: 2400,
      maxHeight: 2400,
      convertSize: MAX_ANSWER_SHEET_BYTES,
      success: (result) => resolve(result as File),
      error: (err) => reject(err instanceof Error ? err : new Error('图片压缩失败')),
    })
  })
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
