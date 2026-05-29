import '../../server/applyUrlShim.js'
import { waitUntil } from '@vercel/functions'
import { applyApiHeaders, handleOptions } from '../../server/apiResponse.js'
import { verifyBatchWorkerSecret } from '../../server/batch/batchTrigger.js'
import { safeRunBatchWorker } from '../../server/batch/batchWorker.js'
import { markBatchFailed } from '../../server/batch/batchTaskStore.js'

export default async function handler(req, res) {
  if (handleOptions(req, res)) return
  applyApiHeaders(req, res)

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' })
  }

  if (!verifyBatchWorkerSecret(req)) {
    console.error('[batch/worker] 鉴权失败', {
      hasSecretHeader: Boolean(req.headers?.['x-batch-worker-secret']),
    })
    return res.status(401).json({ success: false, message: 'Unauthorized' })
  }

  const batchId = req.body?.batchId
  if (!batchId) {
    return res.status(400).json({ success: false, message: '缺少 batchId' })
  }

  console.log('[batch/worker] === 受理请求 ===', {
    batchId,
    method: req.method,
    url: req.url,
  })

  waitUntil(
    (async () => {
      try {
        console.log('[batch/worker] waitUntil 后台任务开始', { batchId })
        const result = await safeRunBatchWorker(batchId)
        console.log('[batch/worker] waitUntil 后台任务结束', { batchId, result })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error('[batch/worker] waitUntil 未捕获异常', { batchId, msg, stack: err instanceof Error ? err.stack : undefined })
        try {
          await markBatchFailed(batchId, msg)
        } catch (markErr) {
          console.error('[batch/worker] 标记 failed 失败', { batchId, markErr })
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
