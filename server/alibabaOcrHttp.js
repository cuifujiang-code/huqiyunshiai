/**
 * 阿里云 OCR RecognizeHandwriting — 使用 axios 直接调用 HTTP API（无 SDK）
 * 文档: https://help.aliyun.com/zh/ocr/developer-reference/api-ocr-api-2021-07-07-recognizehandwriting
 */
import axios from 'axios'
import crypto from 'node:crypto'

const API_VERSION = '2021-07-07'
const API_ACTION = 'RecognizeHandwriting'
const DEFAULT_ENDPOINT = 'ocr-api.cn-hangzhou.aliyuncs.com'

/** 阿里云 RPC 百分号编码 */
export function percentEncode(value) {
  return encodeURIComponent(String(value))
    .replace(/\+/g, '%20')
    .replace(/\*/g, '%2A')
    .replace(/%7E/g, '~')
}

function getUtcTimestamp() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
}

/**
 * 生成 RPC 签名（HMAC-SHA1）
 * @param {Record<string, string>} params 不含 Signature
 * @param {string} accessKeySecret
 * @param {'GET'|'POST'} method
 */
export function signRpcParams(params, accessKeySecret, method = 'POST') {
  const sortedKeys = Object.keys(params).sort()
  const canonicalizedQueryString = sortedKeys
    .map((key) => `${percentEncode(key)}=${percentEncode(params[key])}`)
    .join('&')

  const stringToSign = `${method}&${percentEncode('/')}&${percentEncode(canonicalizedQueryString)}`

  return crypto.createHmac('sha1', `${accessKeySecret}&`).update(stringToSign).digest('base64')
}

function getEndpointHost() {
  return (process.env.ALIBABA_OCR_ENDPOINT || DEFAULT_ENDPOINT).replace(/^https?:\/\//, '').replace(/\/$/, '')
}

function buildSignedQueryParams(extraParams = {}) {
  const accessKeyId = process.env.ALIBABA_ACCESS_KEY_ID?.trim()
  const accessKeySecret = process.env.ALIBABA_ACCESS_KEY_SECRET?.trim()

  if (!accessKeyId || !accessKeySecret) {
    throw new Error('ALIBABA_ACCESS_KEY_ID 或 ALIBABA_ACCESS_KEY_SECRET 未配置')
  }

  const params = {
    Action: API_ACTION,
    Version: API_VERSION,
    Format: 'JSON',
    AccessKeyId: accessKeyId,
    SignatureMethod: 'HMAC-SHA1',
    SignatureVersion: '1.0',
    SignatureNonce: crypto.randomUUID(),
    Timestamp: getUtcTimestamp(),
    ...extraParams,
  }

  params.Signature = signRpcParams(params, accessKeySecret, 'POST')
  return { params, accessKeyId, accessKeySecret }
}

function paramsToQueryString(params) {
  return Object.keys(params)
    .sort()
    .map((key) => `${percentEncode(key)}=${percentEncode(params[key])}`)
    .join('&')
}

/**
 * 通用手写体识别
 * @param {string} imageBase64 不含 data: 前缀的 Base64
 * @param {{ fileName?: string }} options
 */
export async function recognizeHandwritingHttp(imageBase64, { fileName = 'image' } = {}) {
  const host = getEndpointHost()
  const urlBase = `https://${host}/`

  if (!imageBase64?.trim()) {
    throw new Error(`图片 ${fileName} Base64 为空`)
  }

  // 方式一：ImageBase64 作为签名参数（用户要求）
  const { params: formParams } = buildSignedQueryParams({
    NeedRotate: 'true',
    Paragraph: 'true',
    ImageBase64: imageBase64,
  })

  const body = new URLSearchParams()
  for (const key of Object.keys(formParams).sort()) {
    body.append(key, formParams[key])
  }

  console.log('[阿里云OCR HTTP] 请求 (ImageBase64 表单)', {
    fileName,
    endpoint: host,
    action: API_ACTION,
    imageBase64Length: imageBase64.length,
    paramKeys: Object.keys(formParams),
  })

  let response = await axios.post(urlBase, body.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    timeout: 120000,
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
    validateStatus: () => true,
  })

  let parsed = parseOcrResponse(response, 'form-ImageBase64')

  // 若 ImageBase64 参数不被接受，回退为二进制 Body + 查询串签名（与官方 SDK 一致）
  if (shouldRetryWithBinaryBody(parsed, response)) {
    console.warn('[阿里云OCR HTTP] ImageBase64 参数失败，回退为二进制 Body 请求', {
      fileName,
      status: response.status,
      hint: parsed.errorMessage,
    })

    const imageBuffer = Buffer.from(imageBase64, 'base64')
    const { params: queryParams } = buildSignedQueryParams({
      NeedRotate: 'true',
      Paragraph: 'true',
    })

    const queryString = paramsToQueryString(queryParams)
    const binaryUrl = `${urlBase}?${queryString}`

    console.log('[阿里云OCR HTTP] 请求 (二进制 Body)', {
      fileName,
      imageBytes: imageBuffer.length,
      queryKeys: Object.keys(queryParams),
    })

    response = await axios.post(binaryUrl, imageBuffer, {
      headers: { 'Content-Type': 'application/octet-stream' },
      timeout: 120000,
      maxBodyLength: Infinity,
      validateStatus: () => true,
    })

    parsed = parseOcrResponse(response, 'binary-body')
  }

  if (!parsed.ok) {
    const err = new Error(parsed.errorMessage || '阿里云 OCR 请求失败')
    err.httpStatus = parsed.httpStatus
    err.responseBody = parsed.responseBody
    err.requestId = parsed.requestId
    err.code = parsed.code
    throw err
  }

  return parsed.text
}

function shouldRetryWithBinaryBody(parsed, response) {
  if (parsed.ok) return false
  const msg = (parsed.errorMessage || '').toLowerCase()
  return (
    response.status >= 400 ||
    msg.includes('imagebase64') ||
    msg.includes('invalidparameter') ||
    msg.includes('missingparameter') ||
    msg.includes('unsupported')
  )
}

function parseOcrResponse(response, mode) {
  const httpStatus = response.status
  const raw =
    typeof response.data === 'string' ? response.data : JSON.stringify(response.data ?? {})

  console.log('[阿里云OCR HTTP] 响应', {
    mode,
    httpStatus,
    statusText: response.statusText,
    bodyPreview: raw.slice(0, 2000),
  })

  let data
  try {
    data = typeof response.data === 'object' ? response.data : JSON.parse(raw)
  } catch {
    return {
      ok: false,
      httpStatus,
      responseBody: raw.slice(0, 2000),
      errorMessage: `响应不是合法 JSON (HTTP ${httpStatus})`,
    }
  }

  // RPC 错误格式: { Code, Message, RequestId }
  if (data.Code && data.Code !== '200' && data.Code !== 'OK') {
    return {
      ok: false,
      httpStatus,
      responseBody: raw.slice(0, 2000),
      errorMessage: data.Message || data.Code,
      code: data.Code,
      requestId: data.RequestId,
    }
  }

  // 成功格式: { Code: "200", Data: "..." }
  const innerCode = data.Code ?? data.code
  if (innerCode && String(innerCode) !== '200') {
    return {
      ok: false,
      httpStatus,
      responseBody: raw.slice(0, 2000),
      errorMessage: data.Message || data.message || `业务错误码 ${innerCode}`,
      code: innerCode,
      requestId: data.RequestId ?? data.requestId,
    }
  }

  const dataField = data.Data ?? data.data
  if (!dataField) {
    return {
      ok: false,
      httpStatus,
      responseBody: raw.slice(0, 2000),
      errorMessage: '响应缺少 Data 字段',
      requestId: data.RequestId ?? data.requestId,
    }
  }

  return {
    ok: true,
    httpStatus,
    text: extractTextFromHandwritingData(dataField),
    requestId: data.RequestId ?? data.requestId,
  }
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
