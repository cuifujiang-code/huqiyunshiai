export function getDecomposeProcessSecret() {
  return process.env.DECOMPOSE_PROCESS_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
}

/**
 * 解析 decompose-process worker 绝对 URL
 * 优先级（与 batchTrigger.js 保持一致）：
 *   1. DECOMPOSE_PROCESS_URL 显式配置
 *   2. TEACHER_API_URL / VITE_TEACHER_API_URL
 *   3. VERCEL_URL（Vercel 自动注入）
 *   4. 兜底域名 https://api.huqiyunshiai.online
 * 路径强制使用 /api/decompose-process（Vercel 路由要求）
 */
function resolveDecomposeProcessUrl() {
  if (process.env.DECOMPOSE_PROCESS_URL) {
    return process.env.DECOMPOSE_PROCESS_URL.replace(/\/$/, '')
  }

  const path = '/api/decompose-process'

  const apiBase = (
    process.env.TEACHER_API_URL ||
    process.env.VITE_TEACHER_API_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
    'https://api.huqiyunshiai.online'
  ).replace(/\/$/, '')

  return `${apiBase}${path}`
}

/**
 * 触发后台拆题（HTTP self-call）
 * 与 batchTrigger 保持一致的健壮模式：
 *   - 多级 URL 解析
 *   - 30s 超时
 *   - HTTP 状态检查 + 详细日志
 */
export async function triggerDecomposeProcess(taskId) {
  const url = resolveDecomposeProcessUrl()
  const secret = getDecomposeProcessSecret()
  const headers = { 'Content-Type': 'application/json' }
  if (secret) headers['x-decompose-process-secret'] = secret

  console.log('[decomposeTrigger] 触发后台拆题', {
    taskId,
    url,
    hasSecret: Boolean(secret),
    env: {
      TEACHER_API_URL: process.env.TEACHER_API_URL || '(not set)',
      VITE_TEACHER_API_URL: process.env.VITE_TEACHER_API_URL || '(not set)',
      VERCEL_URL: process.env.VERCEL_URL || '(not set)',
      DECOMPOSE_PROCESS_URL: process.env.DECOMPOSE_PROCESS_URL || '(not set)',
    },
  })

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ taskId }),
      signal: AbortSignal.timeout(30000),
    })

    const bodyPreview = (await response.text()).slice(0, 400)
    console.log('[decomposeTrigger] 触发响应', {
      taskId,
      url,
      status: response.status,
      ok: response.ok,
      bodyPreview,
    })

    if (!response.ok) {
      console.error('[decomposeTrigger] 触发失败（非2xx）', {
        taskId,
        url,
        status: response.status,
        bodyPreview,
      })
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const name = err instanceof Error ? err.name : 'Unknown'
    console.error('[decomposeTrigger] 触发网络异常', {
      taskId,
      url,
      errorName: name,
      error: msg,
      hint: name === 'AbortError' ? '请求超时（30s），Vercel 可能正在排队'
        : name === 'TypeError' ? 'DNS/网络不可达，请检查 TEACHER_API_URL 配置'
        : '',
    })
  }
}

export function verifyDecomposeProcessSecret(req) {
  const secret = getDecomposeProcessSecret()
  if (!secret) return true
  return req.headers?.['x-decompose-process-secret'] === secret
}
