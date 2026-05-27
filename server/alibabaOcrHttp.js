/**
 * 阿里云 OCR RecognizeHandwriting — 使用 @alicloud/pop-core 官方 SDK
 * API: ocr-api 2021-07-07（RecognizeHandwriting 不属于 2019-12-30 版本）
 * 文档: https://help.aliyun.com/zh/ocr/developer-reference/api-ocr-api-2021-07-07-recognizehandwriting
 */
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { RPCClient } = require('@alicloud/pop-core')

/** RecognizeHandwriting 必须使用 2021-07-07，使用 2019-12-30 会报服务未开通等错误 */
const API_VERSION = '2021-07-07'
const DEFAULT_ENDPOINT = 'https://ocr-api.cn-hangzhou.aliyuncs.com'

let rpcClient = null

function normalizeEndpoint(raw) {
  const value = (raw || DEFAULT_ENDPOINT).trim()
  if (value.startsWith('http://') || value.startsWith('https://')) return value
  return `https://${value.replace(/\/$/, '')}`
}

export function getAlibabaOcrRpcClient() {
  if (rpcClient) return rpcClient

  const accessKeyId = process.env.ALIBABA_ACCESS_KEY_ID?.trim()
  const accessKeySecret = process.env.ALIBABA_ACCESS_KEY_SECRET?.trim()

  if (!accessKeyId || !accessKeySecret) {
    throw new Error('ALIBABA_ACCESS_KEY_ID 或 ALIBABA_ACCESS_KEY_SECRET 未配置')
  }

  const endpoint = normalizeEndpoint(process.env.ALIBABA_OCR_ENDPOINT)

  rpcClient = new RPCClient({
    accessKeyId,
    accessKeySecret,
    endpoint,
    apiVersion: API_VERSION,
  })

  console.log('[阿里云OCR pop-core] 客户端初始化', {
    endpoint,
    apiVersion: API_VERSION,
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
 * 通用手写体识别（图片 Base64 → 二进制 Body 上传）
 */
export async function recognizeHandwritingHttp(imageBase64, { fileName = 'image' } = {}) {
  if (!imageBase64?.trim()) {
    throw new Error(`图片 ${fileName} Base64 为空`)
  }

  const client = getAlibabaOcrRpcClient()
  const imageBuffer = Buffer.from(imageBase64, 'base64')

  if (!imageBuffer.length) {
    throw new Error(`图片 ${fileName} 解码后为空`)
  }

  const params = {
    NeedRotate: true,
    Paragraph: true,
    body: imageBuffer,
  }

  const requestOption = {
    method: 'POST',
    formatParams: false,
    timeout: 120000,
  }

  console.log('[阿里云OCR pop-core] 发起 RecognizeHandwriting', {
    fileName,
    imageBytes: imageBuffer.length,
    apiVersion: API_VERSION,
    endpoint: normalizeEndpoint(process.env.ALIBABA_OCR_ENDPOINT),
  })

  let result
  try {
    result = await client.request('RecognizeHandwriting', params, requestOption)
  } catch (error) {
    const detail = normalizePopCoreError(error)
    console.error('[阿里云OCR pop-core] SDK 异常', {
      fileName,
      ...detail,
      stack: error?.stack?.split('\n').slice(0, 6),
    })
    const err = new Error(detail.message)
    Object.assign(err, detail)
    throw err
  }

  console.log('[阿里云OCR pop-core] 响应', {
    fileName,
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
}

/** 供测试或热重载时重置单例 */
export function resetAlibabaOcrClient() {
  rpcClient = null
}
