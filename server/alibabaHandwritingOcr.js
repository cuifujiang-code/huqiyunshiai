import { recognizeHandwritingHttp } from './alibabaOcrHttp.js'
import { logStepError } from './apiErrorUtil.js'

/**
 * 阿里云手写 OCR（axios HTTP，无 SDK）
 */
export class AlibabaOcrError extends Error {
  constructor(message, { code, requestId, detail, httpStatus, responseBody } = {}) {
    super(message)
    this.name = 'AlibabaOcrError'
    this.code = code
    this.requestId = requestId
    this.detail = detail
    this.httpStatus = httpStatus
    this.responseBody = responseBody
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      requestId: this.requestId,
      httpStatus: this.httpStatus,
      responseBody: this.responseBody?.slice?.(0, 500) ?? this.responseBody,
      detail: this.detail,
    }
  }
}

/**
 * 单张答题卡图片 Base64 → 手写文字
 */
export async function recognizeHandwritingBase64(base64, { fileName = 'image' } = {}) {
  if (!base64?.trim()) {
    throw new AlibabaOcrError(`图片 ${fileName} 数据为空`)
  }

  try {
    const text = await recognizeHandwritingHttp(base64, { fileName })
    console.log('[阿里云OCR] 识别完成', { fileName, textLength: text.length })
    return text
  } catch (error) {
    logStepError('alibaba-ocr-http', error)

    if (error instanceof AlibabaOcrError) throw error

    throw new AlibabaOcrError(error?.message || '阿里云 OCR 请求异常', {
      code: error?.code,
      httpStatus: error?.httpStatus,
      responseBody: error?.responseBody,
      requestId: error?.requestId,
      detail: error?.message,
    })
  }
}

const MIN_PAGE_CHARS = 10
const MIN_TOTAL_CHARS = 30

/**
 * 多张答题卡逐个识别并合并
 */
export async function recognizeHandwritingImages(images, onProgress) {
  const parts = []

  for (let i = 0; i < images.length; i++) {
    const img = images[i]
    onProgress?.(i + 1, images.length, img.name)

    const text = await recognizeHandwritingBase64(img.base64, { fileName: img.name })
    parts.push({
      index: i + 1,
      name: img.name,
      text: text.trim(),
    })
  }

  const combinedText = parts
    .map((p) => `--- 答题卡第 ${p.index} 张（${p.name}）---\n${p.text || '（未识别到文字）'}`)
    .join('\n\n')

  const incomplete =
    combinedText.length < MIN_TOTAL_CHARS ||
    parts.some((p) => p.text.length < MIN_PAGE_CHARS)

  return { combinedText, incomplete, pageCount: parts.length }
}

export function isAlibabaOcrConfigured() {
  return Boolean(
    process.env.ALIBABA_ACCESS_KEY_ID?.trim() && process.env.ALIBABA_ACCESS_KEY_SECRET?.trim(),
  )
}
