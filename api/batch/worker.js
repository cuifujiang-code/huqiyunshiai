import '../../server/applyUrlShim.js'
import { waitUntil } from '@vercel/functions'
import { setNoCacheHeaders } from '../../server/apiResponse.js'
import { verifyBatchWorkerSecret } from '../../server/batch/batchTrigger.js'
import { safeRunBatchWorker } from '../../server/batch/batchWorker.js'

export default async function handler(req, res) {
  setNoCacheHeaders(res)

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' })
  }

  if (!verifyBatchWorkerSecret(req)) {
    return res.status(401).json({ success: false, message: 'Unauthorized' })
  }

  const batchId = req.body?.batchId
  if (!batchId) {
    return res.status(400).json({ success: false, message: '缺少 batchId' })
  }

  console.log('[batch/worker] 受理', { batchId })

  waitUntil(
    safeRunBatchWorker(batchId).catch((err) => {
      console.error('[batch/worker] 后台异常', batchId, err)
    }),
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
