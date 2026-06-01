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

export default async function handler(req, res) {
  // 最外层 try-catch：捕获所有未处理的同步/异步异常
  try {
    if (handleOptions(req, res)) return
    applyApiHeaders(req, res)

    const batchId = resolveBatchId(req)

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
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`[Worker] 后台处理异常 batchId=${batchId}`, {
          msg,
          stack: err instanceof Error ? err.stack : undefined,
        })
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
    // 最外层兜底：捕获所有未处理的异常（包括 waitUntil 外的同步错误）
    const msg = fatalErr instanceof Error ? fatalErr.message : String(fatalErr)
    console.error('[batch/worker] 致命错误（最外层 catch）', {
      batchId,
      msg,
      stack: fatalErr instanceof Error ? fatalErr.stack : undefined,
    })
    // 如果还没返回响应，返回 500
    if (!res.headersSent) {
      try {
        res.status(500).json({ success: false, message: msg })
      } catch {}
    }
    // 尝试标记任务失败（markBatchFailed 内部会检查 bank 是否已有题）
    if (batchId) {
      try {
        const { markBatchFailed } = await import('../../server/batch/batchTaskStore.js')
        await markBatchFailed(String(batchId).trim(), `[worker.handler 致命错误] ${msg}`)
      } catch {}
    }
  }
}

export const config = {
  maxDuration: 300,
  includeFiles: '{server/**,node_modules/mammoth/**,node_modules/pdf-parse/**,node_modules/pdfjs-dist/**}',
}
