import { buildServerUrl } from '../urlUtil.js'
import { markBatchFailed } from './batchTaskStore.js'

export function getBatchWorkerSecret() {
  return process.env.BATCH_WORKER_SECRET || ''
}

/**
 * 验证 Batch Worker 请求鉴权
 * - 未配置 BATCH_WORKER_SECRET：拒绝请求（生产环境不允许跳过鉴权）
 * - 配置了：比对请求头 x-batch-worker-secret
 */
export function verifyBatchWorkerSecret(req) {
  const secret = getBatchWorkerSecret()
  if (!secret) {
    console.error('[batchTrigger] BATCH_WORKER_SECRET 未配置，拒绝请求')
    return false
  }
  const headerVal =
    req.headers?.['x-batch-worker-secret'] ||
    req.headers?.['X-Batch-Worker-Secret'] ||
    ''
  if (headerVal !== secret) {
    console.error('[batchTrigger] 鉴权失败：secret 不匹配', { hasHeader: Boolean(headerVal) })
    return false
  }
  return true
}

/**
 * 解析 worker 绝对 URL
 * 优先级：BATCH_WORKER_URL > TEACHER_API_URL / VITE_TEACHER_API_URL > 默认值
 * 路径强制使用 /api/batch/worker（Vercle 路由要求）
 */
export function resolveBatchWorkerUrl(req) {
  if (process.env.BATCH_WORKER_URL) {
    return process.env.BATCH_WORKER_URL.replace(/\/$/, '')
  }

  const path = '/api/batch/worker'  // 强制使用 /api/ 前缀，确保 Vercel 路由到 Function

  const apiBase = (
    process.env.TEACHER_API_URL ||
    process.env.VITE_TEACHER_API_URL ||
    'https://api.huqiyunshiai.online'
  ).replace(/\/$/, '')

  return `${apiBase}${path}`
}

/**
 * 触发 Batch Worker（HTTP 调用，用于在 Serverless 环境中链式续跑）
 * @param {string} batchId
 * @param {object} [req] - 可选，用于获取请求头（waitUntil 场景中通常不需要）
 * @returns {Promise<{ok: boolean, status?: number, error?: string}>}
 */
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

/**
 * 链式触发下一批 worker（新 Serverless 实例，走 HTTP）
 * 不在这里 markBatchFailed，交给 emergencyRecover 兜底
 */
export function chainBatchWorker(batchId) {
  console.log('[batchTrigger] 链式续跑 triggerBatchWorker', { batchId })
  triggerBatchWorker(batchId).then((result) => {
    if (!result.ok) {
      const errMsg = result.error || '链式 worker 触发失败'
      console.error('[batchTrigger] 链式触发失败（等待 emergencyRecover 恢复）', {
        batchId,
        errMsg,
        httpStatus: result.status,
      })
    } else {
      console.log('[batchTrigger] 链式触发成功', { batchId, status: result.status })
    }
  }).catch(err => {
    console.error('[batchTrigger] 链式触发异常（等待 emergencyRecover 恢复）', {
      batchId,
      error: err instanceof Error ? err.message : String(err),
    })
  })
}
