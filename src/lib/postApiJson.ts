import { getTeacherApiBase } from './apiBase'

const LOG_PREFIX = '[华祺云师AI API]'

export type ApiPostResult<T> =
  | { kind: 'success'; data: T; status: number; url: string }
  | { kind: 'fallback'; reason: string; status?: number; bodyPreview?: string; url: string }

export interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  /** 请求超时毫秒数，默认不限制 */
  timeoutMs?: number
  /** 附加请求头（如 Authorization） */
  headers?: Record<string, string>
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

const TEACHER_API_PATH_RE = /^\/api\/(teacher|batch|catalog|decompose|planning|ai|student)\b/i

function isTeacherApiPathname(pathname: string): boolean {
  const p = pathname.startsWith('/') ? pathname : `/${pathname}`
  return TEACHER_API_PATH_RE.test(p.split('?')[0].split('#')[0])
}

function isMainSiteBrowser(): boolean {
  if (typeof window === 'undefined') return false
  const host = window.location.hostname
  return host === 'huqiyunshiai.online' || /^www\.huqiyunshiai\.online$/i.test(host)
}

/** 解析绝对或相对 API 地址；主站走同源 /api/*，独立 API 域仅在其他 host 使用 */
function resolveRequestUrl(path: string): string {
  const trimmed = path.trim()
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const u = new URL(trimmed)
      if (isMainSiteBrowser() && /api\.huqiyunshiai\.online/i.test(u.hostname) && isTeacherApiPathname(u.pathname)) {
        const url = `${window.location.origin.replace(/\/$/, '')}${u.pathname}${u.search}`
        console.log(`${LOG_PREFIX} resolveRequestUrl（api 子域→主站同源）`, { in: trimmed, url })
        return url
      }
    } catch {
      /* ignore malformed URL */
    }
    console.log(`${LOG_PREFIX} resolveRequestUrl（绝对地址）`, { url: trimmed })
    return trimmed
  }
  const p = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
  const useTeacherApi = isTeacherApiPathname(p)
  const base = useTeacherApi
    ? getTeacherApiBase()
    : (typeof window !== 'undefined' ? window.location.origin.replace(/\/$/, '') : getTeacherApiBase())
  const url = `${base.replace(/\/$/, '')}${p}`
  console.log(`${LOG_PREFIX} resolveRequestUrl`, { path: p, url, useTeacherApi })
  return url
}

function createTimeoutSignal(timeoutMs?: number): { signal?: AbortSignal; cleanup: () => void } {
  if (!timeoutMs || timeoutMs <= 0) return { cleanup: () => {} }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  return { signal: controller.signal, cleanup: () => clearTimeout(timer) }
}

/**
 * 统一 JSON API 请求：校验 Content-Type，避免将 index.html 误判为 API 成功。
 * 仅使用 fetch + JSON.parse，不使用 eval / new Function。
 */
export async function postApiJson<T>(
  path: string,
  body: unknown,
  label: string,
  options: ApiRequestOptions = {},
): Promise<ApiPostResult<T>> {
  const method = options.method ?? 'POST'
  const url = resolveRequestUrl(path)
  const logBody = method === 'GET'
    ? undefined
    : typeof body === 'object' && body && 'examFileBase64' in (body as Record<string, unknown>)
      ? { ...(body as Record<string, unknown>), examFileBase64: '[base64 omitted]' }
      : body

  console.log(`${LOG_PREFIX} [${label}] 发起请求`, { url, method, body: logBody })

  const { signal, cleanup } = createTimeoutSignal(options.timeoutMs)

  let response: Response
  try {
    response = await fetch(url, {
      method,
      mode: 'cors',
      credentials: 'omit',
      headers: {
        Accept: 'application/json',
        ...(method === 'POST' || method === 'PUT' || method === 'DELETE' ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers ?? {}),
      },
      body: method === 'POST' || method === 'PUT' || method === 'DELETE' ? (body != null ? JSON.stringify(body) : undefined) : undefined,
      signal,
    })
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === 'AbortError'
    const reason = isTimeout
      ? `请求超时（${options.timeoutMs}ms）`
      : `网络错误: ${err instanceof Error ? err.message : String(err)}`
    console.error(`${LOG_PREFIX} [${label}] 请求失败 → 将降级`, { url, reason })
    return { kind: 'fallback', reason, url }
  } finally {
    cleanup()
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
