import { buildServerUrl } from '../urlUtil.js'

export function getBatchWorkerSecret() {
  return process.env.BATCH_WORKER_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
}

export function verifyBatchWorkerSecret(req) {
  const secret = getBatchWorkerSecret()
  if (!secret) return true
  return req.headers?.['x-batch-worker-secret'] === secret
}

function buildWorkerUrl() {
  if (process.env.BATCH_WORKER_BASE_URL) {
    const base = process.env.BATCH_WORKER_BASE_URL.replace(/\/$/, '')
    const path = process.env.BATCH_WORKER_PATH || '/api/batch/worker'
    return `${base}${path}`
  }
  if (process.env.VERCEL_URL) {
    const base = `https://${process.env.VERCEL_URL}`
    const path = process.env.BATCH_WORKER_PATH || '/api/batch/worker'
    return `${base}${path}`
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    const base = `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    const path = process.env.BATCH_WORKER_PATH || '/api/batch/worker'
    return `${base}${path}`
  }
  const port = process.env.PORT || 3001
  const path = process.env.BATCH_WORKER_PATH || '/api/batch/worker'
  return `http://127.0.0.1:${port}${path}`
}

export async function triggerBatchWorker(batchId) {
  const url = buildWorkerUrl()
  const secret = getBatchWorkerSecret()
  const headers = { 'Content-Type': 'application/json' }
  if (secret) headers['x-batch-worker-secret'] = secret

  console.log('[batchTrigger] 触发 worker', { batchId, url })

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ batchId }),
      signal: AbortSignal.timeout(15000),
    })

    if (response.ok) {
      console.log('[batchTrigger] Worker 触发成功', { batchId, status: response.status })
      return { ok: true, status: response.status }
    }

    const body = await response.text().catch(() => '')
    console.error('[batchTrigger] Worker 返回非 2xx', {
      batchId,
      status: response.status,
      body: body.slice(0, 500),
    })
    return { ok: false, status: response.status, error: `HTTP ${response.status}` }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[batchTrigger] Worker 触发网络异常', { batchId, error: msg, url })
    return { ok: false, status: 0, error: msg }
  }
}

export function chainBatchWorker(batchId) {
  triggerBatchWorker(batchId)
}
