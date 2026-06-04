import { createWorker } from 'tesseract.js'

const MIN_CHARS = 8

/**
 * 浏览器端 Tesseract OCR（第三层降级：不依赖外部 OCR/视觉 API）
 */
export async function recognizePhotoImageClient(
  imageUrl: string,
  onProgress?: (message: string) => void,
): Promise<string> {
  onProgress?.('正在加载本机 OCR 引擎（首次可能较慢）...')
  const worker = await createWorker('chi_sim+eng')
  try {
    onProgress?.('正在识别题目文字…')
    const { data } = await worker.recognize(imageUrl)
    return data.text.trim()
  } finally {
    await worker.terminate()
  }
}

export function isClientOcrTextUsable(text: string): boolean {
  return text.trim().length >= MIN_CHARS
}

/** 是否应触发本机 OCR 第三层降级 */
export function shouldRetryWithClientOcr(res: {
  success: boolean
  message?: string
  searchStatus?: string
}): boolean {
  if (res.success) return false
  const msg = (res.message || '').toLowerCase()
  if (res.searchStatus === 'blurry') return true
  return (
    msg.includes('本机 ocr') ||
    msg.includes('视觉识别') ||
    msg.includes('image_url') ||
    msg.includes('ocr 未配置') ||
    msg.includes('全部失败')
  )
}
