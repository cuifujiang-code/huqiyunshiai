import { buildServerUrl } from '../urlUtil.js'

export function getBatchWorkerSecret() {
  return process.env.BATCH_WORKER_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
}

export function verifyBatchWorkerSecret(req) {
  const secret = getBatchWorkerSecret()
  if (!secret) return true
  return req.headers?.['x-batch-worker-secret'] === secret
}

/** 解析 worker 绝对 URL（独立 API 域名必须使用 /api/batch/worker） */
export function resolveBatchWorkerUrl(req) {
  if (process.env.BATCH_WORKER_URL) {
    return process.env.BATCH_WORKER_URL.replace(/\/$/, '')
  }

  let path = process.env.BATCH_WORKER_PATH || '/api/batch/worker'
  if (!path.startsWith('/')) path = `/${path}`

  // vercel.json 仅 /api/* 直达 Function；/batch/worker 会落到 health check
  if (!path.startsWith('/api/')) {
    path = path.startsWith('/batch/') ? `/api${path}` : '/api/batch/worker'
  }

  const apiBase = (
    process.env.TEACHER_API_URL
    || process.env.VITE_TEACHER_API_URL
    || 'https://api.huqiyunshiai.online'
  ).replace(/\/$/, '')
  if (apiBase) return `${apiBase}${path}`

  return buildServerUrl(path, req)
}

export async function triggerBatchWorker(batchId, req) {
  const url = resolveBatchWorkerUrl(req)
  const secret = getBatchWorkerSecret()
  const headers = { 'Content-Type': 'application/json' }
  if (secret) headers['x-batch-worker-secret'] = secret

  console.log('[batchTrigger] 触发 worker', { batchId, url, hasSecret: Boolean(secret) })

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ batchId }),
    })
    const bodyPreview = (await response.text()).slice(0, 400)
    console.log('[batchTrigger] worker 响应', {
      batchId,
      url,
      status: response.status,
      ok: response.ok,
      bodyPreview,
    })
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: `Worker 触发失败 HTTP ${response.status}: ${bodyPreview || response.statusText}`,
      }
    }
    return { ok: true, status: response.status }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    console.error('[batchTrigger] 触发异常', { batchId, url, error })
    return { ok: false, error }
  }
}

import { markBatchFailed } from './batchTaskStore.js'

/** 链式触发下一批 worker（新 Serverless 实例，走 HTTP） */
export function chainBatchWorker(batchId) {
  console.log('[batchTrigger] 链式续跑 triggerBatchWorker', { batchId })
  triggerBatchWorker(batchId).then(async (result) => {
    if (!result.ok) {
      const errMsg = result.error || '链式 worker 触发失败'
      console.error('[batchTrigger] 链式触发失败', { batchId, errMsg, httpStatus: result.status })
      try {
        await markBatchFailed(batchId, errMsg)
      } catch (markErr) {
        console.error('[batchTrigger] 链式 markBatchFailed 失败', { batchId, markErr })
      }
    }
  })
}
