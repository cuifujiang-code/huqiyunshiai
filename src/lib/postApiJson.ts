const LOG_PREFIX = '[华祺云师AI API]'

export type ApiPostResult<T> =
  | { kind: 'success'; data: T; status: number; url: string }
  | { kind: 'fallback'; reason: string; status?: number; bodyPreview?: string; url: string }

export interface ApiRequestOptions {
  method?: 'GET' | 'POST'
  /** 请求超时毫秒数，默认不限制 */
  timeoutMs?: number
}

function isHtmlResponse(contentType: string, text: string) {
  const trimmed = text.trimStart().toLowerCase()
  return (
    contentType.includes('text/html') ||
    trimmed.startsWith('<!doctype') ||
    trimmed.startsWith('<html')
  )
}

function looksLikeJson(text: string) {
  const trimmed = text.trimStart()
  return trimmed.startsWith('{') || trimmed.startsWith('[')
}

/**
 * 统一 JSON API 请求：校验 Content-Type，避免将 index.html 误判为 API 成功。
 */
export async function postApiJson<T>(
  path: string,
  body: unknown,
  label: string,
  options: ApiRequestOptions = {},
): Promise<ApiPostResult<T>> {
  const method = options.method ?? 'POST'
  const url = `${typeof window !== 'undefined' ? window.location.origin : ''}${path}`

  console.log(`${LOG_PREFIX} [${label}] 发起请求`, { url, method, body: method === 'GET' ? undefined : body })

  let response: Response
  try {
    response = await fetch(path, {
      method,
      headers: {
        Accept: 'application/json',
        ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
      },
      body: method === 'POST' && body != null ? JSON.stringify(body) : undefined,
      signal: options.timeoutMs ? AbortSignal.timeout(options.timeoutMs) : undefined,
    })
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === 'TimeoutError'
    const reason = isTimeout
      ? `请求超时（${options.timeoutMs}ms）`
      : `网络错误: ${err instanceof Error ? err.message : String(err)}`
    console.error(`${LOG_PREFIX} [${label}] 请求失败 → 将降级`, { url, reason })
    return { kind: 'fallback', reason, url }
  }

  const contentType = response.headers.get('content-type') ?? ''
  const text = await response.text()
  const bodyPreview = text.slice(0, 800)

  console.log(`${LOG_PREFIX} [${label}] 收到响应`, {
    url,
    status: response.status,
    ok: response.ok,
    contentType,
    bodyLength: text.length,
    bodyPreview,
  })

  if (isHtmlResponse(contentType, text)) {
    const reason = `收到 HTML 页面而非 JSON（status=${response.status}，可能被 SPA rewrite 拦截）`
    console.error(`${LOG_PREFIX} [${label}] ${reason}`, { url, bodyPreview })
    return { kind: 'fallback', reason, status: response.status, bodyPreview, url }
  }

  if (!text) {
    const reason = `响应体为空 (status=${response.status})`
    console.error(`${LOG_PREFIX} [${label}] ${reason}`, { url })
    return { kind: 'fallback', reason, status: response.status, url }
  }

  if (!contentType.includes('application/json') && !looksLikeJson(text)) {
    const reason = `Content-Type 不是 JSON: "${contentType || 'unknown'}"`
    console.error(`${LOG_PREFIX} [${label}] ${reason}`, { url, bodyPreview })
    return { kind: 'fallback', reason, status: response.status, bodyPreview, url }
  }

  let data: T
  try {
    data = JSON.parse(text) as T
  } catch {
    const reason = `JSON 解析失败 (status=${response.status})`
    console.error(`${LOG_PREFIX} [${label}] ${reason}`, { url, bodyPreview })
    return { kind: 'fallback', reason, status: response.status, bodyPreview, url }
  }

  if (!response.ok) {
    const apiMessage = (data as { message?: string })?.message
    const reason = `HTTP ${response.status}${apiMessage ? `: ${apiMessage}` : ''}`
    console.error(`${LOG_PREFIX} [${label}] API 错误 → 将降级`, { url, reason, data })
    return { kind: 'fallback', reason, status: response.status, bodyPreview: text.slice(0, 800), url }
  }

  console.log(`${LOG_PREFIX} [${label}] 解析成功`, { url, data })

  return { kind: 'success', data, status: response.status, url }
}
