import { getDeepSeekConfigSummary, serializeError } from './deepseekClient.js'

/** 禁止 CDN/浏览器缓存 API 响应，避免 Vercel 返回旧 HTML */
export function setNoCacheHeaders(res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
  res.setHeader('Pragma', 'no-cache')
  res.setHeader('Expires', '0')
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
