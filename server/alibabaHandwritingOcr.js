import { Readable } from 'node:stream'
import { $OpenApiUtil } from '@alicloud/openapi-core'
import { logStepError } from './apiErrorUtil.js'

/**
 * 通用手写体识别 RecognizeHandwriting（@alicloud/ocr-api20210707）
 * 注：@alicloud/ocr20191230 不包含此 API
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

let ocrSdk = null

async function loadOcrSdk() {
  if (!ocrSdk) {
    ocrSdk = await import('@alicloud/ocr-api20210707')
  }
  return ocrSdk
}

function getAlibabaCredentials() {
  const accessKeyId = process.env.ALIBABA_ACCESS_KEY_ID?.trim()
  const accessKeySecret = process.env.ALIBABA_ACCESS_KEY_SECRET?.trim()

  if (!accessKeyId || !accessKeySecret) {
    throw new AlibabaOcrError('阿里云OCR未配置：请在 Vercel 设置 ALIBABA_ACCESS_KEY_ID 和 ALIBABA_ACCESS_KEY_SECRET')
  }

  return { accessKeyId, accessKeySecret }
}

async function createOcrClient() {
  const { accessKeyId, accessKeySecret } = getAlibabaCredentials()
  const sdk = await loadOcrSdk()
  const ClientClass = sdk.default ?? sdk

  const endpoint = (process.env.ALIBABA_OCR_ENDPOINT || 'ocr-api.cn-hangzhou.aliyuncs.com').replace(
    /^https?:\/\//,
    '',
  )

  const config = new $OpenApiUtil.Config({
    accessKeyId,
    accessKeySecret,
    endpoint,
  })

  console.log('[阿里云OCR] 客户端初始化', {
    endpoint,
    hasAccessKeyId: Boolean(accessKeyId),
    hasAccessKeySecret: Boolean(accessKeySecret),
  })

  return new ClientClass(config)
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
  const client = await createOcrClient()
  const sdk = await loadOcrSdk()
  const buffer = Buffer.from(base64, 'base64')

  if (!buffer.length) {
    throw new AlibabaOcrError(`图片 ${fileName} 数据为空`)
  }

  const RecognizeHandwritingRequest = sdk.RecognizeHandwritingRequest
  const request = new RecognizeHandwritingRequest({
    needRotate: true,
    paragraph: true,
    body: Readable.from(buffer),
  })

  console.log('[阿里云OCR] RecognizeHandwriting 请求', {
    fileName,
    imageBytes: buffer.length,
  })

  let response
  try {
    response = await client.recognizeHandwriting(request)
  } catch (error) {
    logStepError('alibaba-ocr-request', error)
    const msg = error?.message || '阿里云 OCR 请求异常'
    throw new AlibabaOcrError(msg, {
      code: error?.code,
      detail: error?.data ?? error?.message,
    })
  }

  const body = response?.body
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

export function isAlibabaOcrConfigured() {
  return Boolean(
    process.env.ALIBABA_ACCESS_KEY_ID?.trim() && process.env.ALIBABA_ACCESS_KEY_SECRET?.trim(),
  )
}
