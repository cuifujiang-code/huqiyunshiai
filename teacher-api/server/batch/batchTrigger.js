import { buildServerUrl } from '../urlUtil.js'

export function getBatchWorkerSecret() {
  return process.env.BATCH_WORKER_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
}

export function verifyBatchWorkerSecret(req) {
  const secret = getBatchWorkerSecret()
  if (!secret) return true
  return req.headers?.['x-batch-worker-secret'] === secret
}

export function triggerBatchWorker(batchId) {
  const path = process.env.BATCH_WORKER_PATH || '/api/batch/worker'
  const url = buildServerUrl(path)
  const secret = getBatchWorkerSecret()
  const headers = { 'Content-Type': 'application/json' }
  if (secret) headers['x-batch-worker-secret'] = secret

  console.log('[batchTrigger] 触发 worker', { batchId, url })

  fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ batchId }),
  }).catch((err) => {
    console.error('[batchTrigger] 触发失败', err)
  })
}

/** 链式触发下一批 worker（大批量分轮处理，避免单次 60s 超时） */
export function chainBatchWorker(batchId) {
  triggerBatchWorker(batchId)
}
