/**
 * 阿里云 OCR RecognizeHandwriting — @alicloud/pop-core 官方 SDK
 * endpoint 硬编码为杭州公网地址，不读取 ALIBABA_OCR_ENDPOINT 环境变量
 */
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { RPCClient } = require('@alicloud/pop-core')

/** 唯一公网接入地址（硬编码，禁止被环境变量覆盖） */
export const OCR_ENDPOINT = 'https://ocr-api.cn-hangzhou.aliyuncs.com'
export const OCR_API_VERSION = '2021-07-07'

let rpcClient = null

export function getAlibabaOcrRpcClient() {
  if (rpcClient) return rpcClient

  const accessKeyId = process.env.ALIBABA_ACCESS_KEY_ID?.trim()
  const accessKeySecret = process.env.ALIBABA_ACCESS_KEY_SECRET?.trim()

  if (!accessKeyId || !accessKeySecret) {
    throw new Error('ALIBABA_ACCESS_KEY_ID 或 ALIBABA_ACCESS_KEY_SECRET 未配置')
  }

  console.log('[OCR诊断] 使用endpoint:', OCR_ENDPOINT)

  rpcClient = new RPCClient({
    accessKeyId,
    accessKeySecret,
    endpoint: OCR_ENDPOINT,
    apiVersion: OCR_API_VERSION,
  })

  console.log('[阿里云OCR pop-core] 客户端初始化', {
    endpoint: OCR_ENDPOINT,
    apiVersion: OCR_API_VERSION,
    hasAccessKeyId: Boolean(accessKeyId),
  })

  return rpcClient
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

    return JSON.stringify(parsed)
  } catch {
    return String(dataStr).trim()
  }
}

function normalizePopCoreError(error) {
  const data = error?.data ?? error?.Data ?? {}
  return {
    name: error?.name || 'AlibabaOcrError',
    message: error?.message || data.Message || data.message || '阿里云 OCR 请求失败',
    code: error?.code || data.Code || data.code,
    requestId: error?.requestId || data.RequestId || data.requestId,
    responseBody: JSON.stringify(data).slice(0, 2000),
    httpStatus: error?.statusCode || error?.status,
  }
}

/**
 * 通用手写体识别
 */
export async function recognizeHandwritingHttp(imageBase64, { fileName = 'image' } = {}) {
  if (!imageBase64?.trim()) {
    throw new Error(`图片 ${fileName} Base64 为空`)
  }

  console.log('[OCR诊断] 使用endpoint:', OCR_ENDPOINT)

  const client = getAlibabaOcrRpcClient()
  const imageBuffer = Buffer.from(imageBase64, 'base64')

  if (!imageBuffer.length) {
    throw new Error(`图片 ${fileName} 解码后为空`)
  }

  const requestOption = {
    method: 'POST',
    formatParams: false,
    timeout: 120000,
  }

  // 优先二进制 body（官方推荐）；失败时尝试 ImageBase64 参数
  const attempts = [
    {
      label: 'body-binary',
      params: { NeedRotate: true, Paragraph: true, body: imageBuffer },
    },
    {
      label: 'ImageBase64',
      params: { NeedRotate: true, Paragraph: true, ImageBase64: imageBase64 },
    },
  ]

  let lastError = null

  for (const attempt of attempts) {
    console.log('[阿里云OCR pop-core] 发起 RecognizeHandwriting', {
      fileName,
      mode: attempt.label,
      imageBytes: imageBuffer.length,
      apiVersion: OCR_API_VERSION,
      endpoint: OCR_ENDPOINT,
    })

    try {
      const result = await client.request('RecognizeHandwriting', attempt.params, requestOption)

      console.log('[阿里云OCR pop-core] 响应', {
        fileName,
        mode: attempt.label,
        code: result?.Code,
        message: result?.Message,
        requestId: result?.RequestId,
        dataPreview: String(result?.Data ?? '').slice(0, 500),
      })

      const code = result?.Code ?? result?.code
      if (code && String(code) !== '200') {
        const err = new Error(result?.Message || result?.message || `阿里云 OCR 错误码 ${code}`)
        err.code = code
        err.requestId = result?.RequestId ?? result?.requestId
        err.responseBody = JSON.stringify(result).slice(0, 2000)
        throw err
      }

      const dataField = result?.Data ?? result?.data
      if (!dataField) {
        throw new Error('阿里云 OCR 响应缺少 Data 字段')
      }

      return extractTextFromHandwritingData(dataField)
    } catch (error) {
      lastError = error
      const detail = normalizePopCoreError(error)
      console.warn('[阿里云OCR pop-core] 尝试失败', { fileName, mode: attempt.label, ...detail })
    }
  }

  const detail = normalizePopCoreError(lastError)
  console.error('[阿里云OCR pop-core] 全部尝试失败', { fileName, ...detail })
  const err = new Error(detail.message)
  Object.assign(err, detail)
  throw err
}

export function resetAlibabaOcrClient() {
  rpcClient = null
}
