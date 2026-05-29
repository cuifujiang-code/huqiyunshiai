import '../../server/applyUrlShim.js'
import { applyApiHeaders, handleOptions } from '../../server/apiResponse.js'
import { startBatchProcessing } from '../../server/batch/batchStart.js'
import { isBatchStoreConfigured, markBatchFailed } from '../../server/batch/batchTaskStore.js'

export default async function handler(req, res) {
  if (handleOptions(req, res)) return
  applyApiHeaders(req, res)

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' })
  }

  if (!isBatchStoreConfigured()) {
    return res.status(503).json({ success: false, message: 'Supabase 未配置' })
  }

  const batchId = req.body?.batchId
  const teacherId = req.body?.teacherId

  try {
    const result = await startBatchProcessing(batchId, teacherId, req)
    return res.status(result.httpStatus ?? (result.ok ? 200 : 500)).json({
      success: result.ok,
      batchId: result.batchId ?? batchId,
      status: result.taskStatus,
      message: result.message,
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : '启动失败'
    console.error('[batch/start] 未捕获异常', { batchId, teacherId, msg })
    if (batchId) {
      try {
        await markBatchFailed(String(batchId).trim(), msg)
      } catch (markErr) {
        console.error('[batch/start] markBatchFailed 失败', markErr)
      }
    }
    return res.status(500).json({ success: false, message: msg })
  }
}

export const config = {
  maxDuration: 10,
}
