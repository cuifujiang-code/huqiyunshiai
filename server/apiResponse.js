import { getDeepSeekConfigSummary, serializeError } from './deepseekClient.js'

/** 禁止 CDN/浏览器缓存 API 响应，避免 Vercel 返回旧 HTML */
export function setNoCacheHeaders(res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
  res.setHeader('Pragma', 'no-cache')
  res.setHeader('Expires', '0')
}

function getAllowedOrigin(req) {
  const configured = process.env.TEACHER_API_ALLOWED_ORIGINS
    || 'https://huqiyunshiai.online,https://www.huqiyunshiai.online,http://localhost:5173,http://127.0.0.1:5173'
  const allowed = configured.split(',').map((item) => item.trim()).filter(Boolean)
  const origin = req?.headers?.origin
  if (origin && allowed.includes(origin)) return origin
  if (origin && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return origin
  return allowed[0] || '*'
}

/** 跨域 + 防缓存（独立 API 域名供前端站点调用） */
export function setCorsHeaders(req, res) {
  res.setHeader('Access-Control-Allow-Origin', getAllowedOrigin(req))
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-decompose-process-secret, x-batch-worker-secret')
  res.setHeader('Access-Control-Max-Age', '86400')
}

export function applyApiHeaders(req, res) {
  setCorsHeaders(req, res)
  setNoCacheHeaders(res)
}

export function handleOptions(req, res) {
  if (req.method === 'OPTIONS') {
    applyApiHeaders(req, res)
    res.status(204).end()
    return true
  }
  return false
}

/**
 * 构建 Vercel/Express API 统一 JSON 响应（含错误详情）
 */
export function buildApiSuccessPayload(result) {
  return {
    success: true,
    message: result.message,
    report: result.report,
    exam: result.exam,
    isMockFallback: result.isMockFallback ?? false,
    errorDetail: result.errorDetail ?? null,
    deepseekConfig: getDeepSeekConfigSummary(),
  }
}

export function buildApiErrorPayload(error, fallbackMessage) {
  const errorDetail = serializeError(error)
  console.error(`[API] ${fallbackMessage}`, errorDetail)

  return {
    success: false,
    message: error instanceof Error ? error.message : fallbackMessage,
    errorDetail,
    deepseekConfig: getDeepSeekConfigSummary(),
  }
}

export function buildMockFallbackPayload(result) {
  if (result.isMockFallback && result.errorDetail) {
    console.warn('[API] AI 降级为模拟数据', result.errorDetail)
  }

  return {
    success: true,
    message: result.message,
    report: result.report,
    exam: result.exam,
    isMockFallback: true,
    errorDetail: result.errorDetail ?? null,
    deepseekConfig: getDeepSeekConfigSummary(),
  }
}
