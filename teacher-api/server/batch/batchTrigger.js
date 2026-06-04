import { resolveTeacherApiBase } from '../resolveTeacherApiBase.js'
import { markBatchFailed } from './batchTaskStore.js'

export function getBatchWorkerSecret() {
  return process.env.BATCH_WORKER_SECRET || ''
}

/**
 * 验证 Batch Worker 请求鉴权
 * - 未配置 secret：放行（开发/自引用场景）
 * - 配置了：比对请求头 x-batch-worker-secret
 */
export function verifyBatchWorkerSecret(req) {
  const secret = getBatchWorkerSecret()
  if (!secret) return true
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

  return `${resolveTeacherApiBase()}/api/batch/worker`
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

  console.log('[batchTrigger] 触发 worker', {
    batchId,
    url,
    hasSecret: Boolean(secret),
    env: {
      TEACHER_API_URL: process.env.TEACHER_API_URL || '(not set)',
      VITE_TEACHER_API_URL: process.env.VITE_TEACHER_API_URL || '(not set)',
      BATCH_WORKER_URL: process.env.BATCH_WORKER_URL || '(not set)',
      VERCEL_ENV: process.env.VERCEL_ENV || '(not set)',
    },
  })

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ batchId }),
      signal: AbortSignal.timeout(30000),
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
    const msg = err instanceof Error ? err.message : String(err)
    const name = err instanceof Error ? err.name : 'Unknown'
    console.error('[batchTrigger] 触发网络异常', {
      batchId,
      url,
      errorName: name,
      error: msg,
      hint: name === 'AbortError' ? '请求超时（30s），Vercel 可能正在排队'
        : name === 'TypeError' ? 'DNS/网络不可达，请检查域名'
        : '',
    })
    return { ok: false, status: 0, error: `${name}: ${msg}` }
  }
}
