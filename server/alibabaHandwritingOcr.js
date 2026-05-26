import { Readable } from 'node:stream'
import OcrApi20210707, * as $OcrApi from '@alicloud/ocr-api20210707'
import * as $OpenApi from '@alicloud/openapi-core'

/**
 * 通用手写体识别（RecognizeHandwriting）
 * 使用 @alicloud/ocr-api20210707（ocr20191230 不包含该 API）
 */
export class AlibabaOcrError extends Error {
  constructor(message, { code, requestId, detail } = {}) {
    super(message)
    this.name = 'AlibabaOcrError'
    this.code = code
    this.requestId = requestId
    this.detail = detail
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      requestId: this.requestId,
      detail: this.detail,
    }
  }
}

function getOcrClient() {
  const accessKeyId = process.env.ALIBABA_ACCESS_KEY_ID
  const accessKeySecret = process.env.ALIBABA_ACCESS_KEY_SECRET

  if (!accessKeyId || !accessKeySecret) {
    throw new AlibabaOcrError('ALIBABA_ACCESS_KEY_ID 或 ALIBABA_ACCESS_KEY_SECRET 未配置')
  }

  const config = new $OpenApi.Config({
    accessKeyId,
    accessKeySecret,
    endpoint: process.env.ALIBABA_OCR_ENDPOINT || 'ocr-api.cn-hangzhou.aliyuncs.com',
  })

  return new OcrApi20210707.default(config)
}

function extractTextFromHandwritingData(dataStr) {
  if (!dataStr?.trim()) return ''

  try {
    const parsed = JSON.parse(dataStr)
    if (typeof parsed === 'string') return parsed
    if (typeof parsed.content === 'string') return parsed.content
    if (typeof parsed.Content === 'string') return parsed.Content

    if (Array.isArray(parsed.prism_wordsInfo)) {
      return parsed.prism_wordsInfo.map((w) => w.word || w.text || '').filter(Boolean).join('\n')
    }
    if (Array.isArray(parsed.words_info)) {
      return parsed.words_info.map((w) => w.word || w.text || '').filter(Boolean).join('\n')
    }
    if (Array.isArray(parsed.lines)) {
      return parsed.lines.map((l) => l.text || l.content || '').filter(Boolean).join('\n')
    }
    if (Array.isArray(parsed.results)) {
      return parsed.results
        .map((r) => r.text || r.content || r.word || '')
        .filter(Boolean)
        .join('\n')
    }

    return JSON.stringify(parsed)
  } catch {
    return dataStr.trim()
  }
}

/**
 * 单张答题卡图片 Base64 → 手写文字
 */
export async function recognizeHandwritingBase64(base64, { fileName = 'image' } = {}) {
  const client = getOcrClient()
  const buffer = Buffer.from(base64, 'base64')

  if (!buffer.length) {
    throw new AlibabaOcrError(`图片 ${fileName} 数据为空`)
  }

  const request = new $OcrApi.RecognizeHandwritingRequest({
    needRotate: true,
    paragraph: true,
    body: Readable.from(buffer),
  })

  console.log('[阿里云OCR] RecognizeHandwriting 请求', {
    fileName,
    imageBytes: buffer.length,
  })

  const response = await client.recognizeHandwriting(request)
  const body = response.body

  const code = body?.code
  if (code && String(code) !== '200') {
    throw new AlibabaOcrError(body?.message || `阿里云 OCR 返回错误码 ${code}`, {
      code,
      requestId: body?.requestId,
      detail: body?.data,
    })
  }

  const text = extractTextFromHandwritingData(body?.data)
  console.log('[阿里云OCR] 识别完成', { fileName, textLength: text.length })

  return text
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
