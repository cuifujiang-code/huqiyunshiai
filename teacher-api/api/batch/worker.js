import '../../server/applyUrlShim.js'
import { waitUntil } from '@vercel/functions'
import { applyApiHeaders, handleOptions } from '../../server/apiResponse.js'
import { verifyBatchWorkerSecret } from '../../server/batch/batchTrigger.js'
import { safeRunBatchWorker } from '../../server/batch/batchWorker.js'

function resolveBatchId(req) {
  const fromBody = req.body?.batchId
  const fromQuery = req.query?.batchId
  const raw = fromBody ?? fromQuery
  if (raw == null || raw === '') return null
  return String(raw).trim()
}

function getEnvSummary() {
  const vars = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ? '***configured***' : null,
    DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY ? '***configured***' : null,
    BATCH_WORKER_SECRET: process.env.BATCH_WORKER_SECRET ? '***configured***' : null,
    TEACHER_API_URL: process.env.TEACHER_API_URL || process.env.VITE_TEACHER_API_URL || '(not set)',
    VERCEL_ENV: process.env.VERCEL_ENV || '(not set)',
  }
  const missing = Object.entries(vars)
    .filter(([, v]) => v === null)
    .map(([k]) => k)
  return { vars, missing, allOk: missing.length === 0 }
}

function isJsonParseFailure(err) {
  const msg = err instanceof Error ? err.message : String(err ?? '')
  return /JSON\s*解析|JSON\s*修复|repairJSON|Expected\s*','|Expected\s*'}'|JSON\.parse/i.test(msg)
}

function buildFailureMessage(error) {
  const msg = error instanceof Error ? error.message : String(error ?? '')
  const rawPreview = error?.rawPreview ?? error?.cause?.rawPreview
  if (isJsonParseFailure(error)) {
    const preview = String(rawPreview ?? '').slice(0, 1000)
    return `[JSON解析失败] ${msg}${preview ? `\n原始内容前1000字符: ${preview}` : ''}`
  }
  return msg
}

async function handleWorkerFatalError(batchId, error) {
  const msg = buildFailureMessage(error)
  const stack = error instanceof Error ? error.stack : undefined
  console.error('=== Worker 处理遇到未捕获异常 ===')
  console.error(msg)
  if (isJsonParseFailure(error)) {
    console.error('[batch/worker] JSON 解析失败详情', {
      batchId,
      rawPreview: String(error?.rawPreview ?? error?.cause?.rawPreview ?? '').slice(0, 1000),
    })
  }
  console.error(stack)
  if (batchId) {
    try {
      const { markBatchFailed } = await import('../../server/batch/batchTaskStore.js')
      await markBatchFailed(String(batchId).trim(), msg)
    } catch (markErr) {
      console.error('[batch/worker] markBatchFailed 失败', {
        batchId,
        err: markErr instanceof Error ? markErr.message : String(markErr),
      })
    }
  }
}

export default async function handler(req, res) {
  console.log('[worker-debug] 函数已启动')
  let batchId = null
  // 最外层 try-catch：捕获所有未处理的同步/异步异常
  try {
    if (handleOptions(req, res)) return
    applyApiHeaders(req, res)

    batchId = resolveBatchId(req)

  console.log('[batch/worker] === 收到请求 ===', {
    method: req.method,
    url: req.url,
    batchId,
    fromBody: Boolean(req.body?.batchId),
    fromQuery: Boolean(req.query?.batchId),
    host: req.headers?.host,
  })

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' })
  }

  if (!verifyBatchWorkerSecret(req)) {
    console.error('[batch/worker] 鉴权失败', {
      batchId,
      hasSecretHeader: Boolean(req.headers?.['x-batch-worker-secret']),
    })
    return res.status(401).json({ success: false, message: 'Unauthorized' })
  }

  // 环境诊断：缺少关键环境变量时记录警告但不拒绝
  // Worker 内部会在实际操作失败时自然报错
  const env = getEnvSummary()
  if (!env.allOk) {
    console.warn('[batch/worker] 关键环境变量可能缺失', {
      batchId,
      missing: env.missing,
    })
  }
  console.log('[batch/worker] 受理请求', { batchId, env: env.missing.length === 0 ? 'all ok' : `missing: ${env.missing.join(',')}` })

  if (!batchId) {
    return res.status(400).json({ success: false, message: '缺少 batchId（支持 JSON body 或 query 参数）' })
  }

  waitUntil(
    (async () => {
      console.log(`[Worker] 开始处理 batchId=${batchId}`)
      try {
        const result = await safeRunBatchWorker(batchId)
        console.log(`[Worker] 后台处理结束 batchId=${batchId}`, { result })
      } catch (err) {
        console.error(`[Worker] 后台异常 batchId=${batchId}`, {
          jsonParse: isJsonParseFailure(err),
          message: err instanceof Error ? err.message : String(err),
        })
        await handleWorkerFatalError(batchId, err)
      }
    })(),
  )

  console.log('[batch/worker] 已受理，返回 202', { batchId })

  return res.status(202).json({
    success: true,
    batchId,
    message: 'Worker 已受理，正在后台并发处理',
  })
  } catch (fatalErr) {
    await handleWorkerFatalError(batchId, fatalErr)
    const msg = fatalErr instanceof Error ? fatalErr.message : String(fatalErr)
    if (!res.headersSent) {
      try {
        res.status(500).json({ success: false, message: msg })
      } catch {}
    }
  }
}

export const config = {
  maxDuration: 300,
  includeFiles: '{server/**,node_modules/mammoth/**,node_modules/pdf-parse/**,node_modules/pdfjs-dist/**}',
}
