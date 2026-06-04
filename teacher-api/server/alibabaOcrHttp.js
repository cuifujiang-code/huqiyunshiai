/**
 * 阿里云 OCR RecognizeHandwriting — teacher-api 副本
 */
import './applyUrlShim.js'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { RPCClient } = require('@alicloud/pop-core')

export const OCR_ENDPOINT = 'https://ocr-api.cn-hangzhou.aliyuncs.com'
export const OCR_API_VERSION = '2021-07-07'

let rpcClient = null

export function isAlibabaOcrConfigured() {
  return Boolean(
    process.env.ALIBABA_ACCESS_KEY_ID?.trim() &&
    process.env.ALIBABA_ACCESS_KEY_SECRET?.trim(),
  )
}

export function getAlibabaOcrRpcClient() {
  if (rpcClient) return rpcClient
  const accessKeyId = process.env.ALIBABA_ACCESS_KEY_ID?.trim()
  const accessKeySecret = process.env.ALIBABA_ACCESS_KEY_SECRET?.trim()
  if (!accessKeyId || !accessKeySecret) {
    throw new Error('ALIBABA_ACCESS_KEY_ID 或 ALIBABA_ACCESS_KEY_SECRET 未配置')
  }
  rpcClient = new RPCClient({
    accessKeyId,
    accessKeySecret,
    endpoint: OCR_ENDPOINT,
    apiVersion: OCR_API_VERSION,
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

const OCR_MODES = {
  standard: { NeedRotate: true, Paragraph: true },
  enhanced: { NeedRotate: true, Paragraph: false },
}

export async function recognizeHandwritingHttp(imageBase64, { fileName = 'image', mode = 'standard' } = {}) {
  if (!imageBase64?.trim()) throw new Error(`图片 ${fileName} Base64 为空`)

  const client = getAlibabaOcrRpcClient()
  const imageBuffer = Buffer.from(imageBase64, 'base64')
  if (!imageBuffer.length) throw new Error(`图片 ${fileName} 解码后为空`)

  const ocrFlags = OCR_MODES[mode] || OCR_MODES.standard
  // ⚡ 超时从 28s 缩短为 8s，避免拖垮整个拍照搜题流程
  const requestOption = { method: 'POST', formatParams: false, timeout: 8000 }

  // 最多重试 1 次（先 body-binary，失败后 fallback 到 ImageBase64）
  const attempts = [
    { label: 'body-binary', params: { ...ocrFlags, body: imageBuffer } },
    { label: 'ImageBase64', params: { ...ocrFlags, ImageBase64: imageBase64 } },
  ]

  let lastError = null
  for (let i = 0; i < attempts.length; i++) {
    const attempt = attempts[i]
    try {
      const result = await client.request('RecognizeHandwriting', attempt.params, requestOption)
      const code = result?.Code ?? result?.code
      if (code && String(code) !== '200') {
        throw new Error(result?.Message || result?.message || `阿里云 OCR 错误码 ${code}`)
      }
      const dataField = result?.Data ?? result?.data
      if (!dataField) throw new Error('阿里云 OCR 响应缺少 Data 字段')
      return extractTextFromHandwritingData(dataField)
    } catch (error) {
      lastError = error
      console.warn('[alibabaOcr] 尝试失败', { fileName, mode, attempt: attempt.label, message: error?.message })
      // 第一次重试失败 → 立即返回，不再继续
      if (i > 0) break
    }
  }

  throw lastError instanceof Error ? lastError : new Error('阿里云 OCR 全部尝试失败')
}
