import { buildServerUrl } from '../urlUtil.js'

export function getDecomposeProcessSecret() {
  return process.env.DECOMPOSE_PROCESS_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
}

function resolveDecomposeProcessUrl() {
  if (process.env.DECOMPOSE_PROCESS_URL) {
    return process.env.DECOMPOSE_PROCESS_URL.replace(/\/$/, '')
  }
  return buildServerUrl('/api/decompose-process')
}

export async function triggerDecomposeProcess(taskId) {
  const url = resolveDecomposeProcessUrl()
  const secret = getDecomposeProcessSecret()
  const headers = { 'Content-Type': 'application/json' }
  if (secret) headers['x-decompose-process-secret'] = secret

  console.log('[decomposeTrigger] 触发后台拆题', { taskId, url })

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
      status: response.status,
      ok: response.ok,
      bodyPreview,
    })
    if (!response.ok) {
      console.error('[decomposeTrigger] 触发失败（非2xx）', { taskId, url, status: response.status, bodyPreview })
    }
  } catch (err) {
    console.error('[decomposeTrigger] 触发网络异常', {
      taskId,
      url,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

export function verifyDecomposeProcessSecret(req) {
  const secret = getDecomposeProcessSecret()
  if (!secret) return true
  return req.headers?.['x-decompose-process-secret'] === secret
}
