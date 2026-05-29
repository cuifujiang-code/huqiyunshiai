import '../../server/applyUrlShim.js'
import { waitUntil } from '@vercel/functions'
import { applyApiHeaders, handleOptions } from '../../server/apiResponse.js'
import { verifyBatchWorkerSecret } from '../../server/batch/batchTrigger.js'
import { safeRunBatchWorker } from '../../server/batch/batchWorker.js'
import { markBatchFailed } from '../../server/batch/batchTaskStore.js'

function resolveBatchId(req) {
  const fromBody = req.body?.batchId
  const fromQuery = req.query?.batchId
  const raw = fromBody ?? fromQuery
  if (raw == null || raw === '') return null
  return String(raw).trim()
}

export default async function handler(req, res) {
  if (handleOptions(req, res)) return
  applyApiHeaders(req, res)

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' })
  }

  const batchId = resolveBatchId(req)
  console.log('[batch/worker] 收到请求', {
    method: req.method,
    url: req.url,
    batchId,
    fromBody: Boolean(req.body?.batchId),
    fromQuery: Boolean(req.query?.batchId),
  })

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
      try {
        console.log('[batch/worker] waitUntil 后台任务开始', { batchId })
        const result = await safeRunBatchWorker(batchId)
        console.log('[batch/worker] waitUntil 后台任务结束', { batchId, result })
        if (result && result.success === false && result.message) {
          console.error('[batch/worker] safeRunBatchWorker 返回失败', { batchId, result })
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error('[batch/worker] waitUntil 未捕获异常', {
          batchId,
          msg,
          stack: err instanceof Error ? err.stack : undefined,
        })
        try {
          await markBatchFailed(batchId, msg)
        } catch (markErr) {
          console.error('[batch/worker] markBatchFailed 失败', { batchId, markErr })
        }
      }
    })(),
  )

  return res.status(202).json({
    success: true,
    batchId,
    message: 'Worker 已受理，正在后台并发处理',
  })
}

export const config = {
  maxDuration: 60,
  includeFiles: '{server/**,node_modules/mammoth/**,node_modules/pdf-parse/**,node_modules/pdfjs-dist/**}',
}
