import { buildServerUrl } from '../urlUtil.js'

export function getDecomposeProcessSecret() {
  return process.env.DECOMPOSE_PROCESS_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
}

export function triggerDecomposeProcess(taskId) {
  const url = buildServerUrl('/decompose-process')
  const secret = getDecomposeProcessSecret()
  const headers = { 'Content-Type': 'application/json' }
  if (secret) headers['x-decompose-process-secret'] = secret

  console.log('[decomposeTrigger] 触发后台拆题', { taskId })

  fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ taskId }),
  }).catch((err) => {
    console.error('[decomposeTrigger] 触发失败', err)
  })
}

export function verifyDecomposeProcessSecret(req) {
  const secret = getDecomposeProcessSecret()
  if (!secret) return true
  return req.headers?.['x-decompose-process-secret'] === secret
}
