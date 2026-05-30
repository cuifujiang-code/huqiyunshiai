import '../../server/applyUrlShim.js'
import { applyApiHeaders, handleOptions } from '../../server/apiResponse.js'
import { startBatchProcessing } from '../../server/batch/batchStart.js'
import { isBatchStoreConfigured, markBatchFailed } from '../../server/batch/batchTaskStore.js'

export default async function handler(req, res) {
  if (handleOptions(req, res)) return
  applyApiHeaders(req, res)

  const batchId = req.body?.batchId
  const teacherId = req.body?.teacherId

  console.log('[batch/start] === 收到请求 ===', {
    batchId,
    teacherId,
    method: req.method,
    host: req.headers?.host,
    origin: req.headers?.origin,
  })

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' })
  }

  if (!isBatchStoreConfigured()) {
    return res.status(503).json({ success: false, message: 'Supabase 未配置' })
  }

  try {
    const result = await startBatchProcessing(batchId, teacherId, req)

    console.log('[batch/start] === 处理结果 ===', {
      batchId: result.batchId ?? batchId,
      ok: result.ok,
      taskStatus: result.taskStatus,
      message: result.message,
      skipped: result.skipped,
    })

    if (!result.ok) {
      console.error('[batch/start] 启动失败（已 markBatchFailed）', {
        batchId: result.batchId ?? batchId,
        message: result.message,
      })
    }

    return res.status(result.httpStatus ?? (result.ok ? 202 : 500)).json({
      success: result.ok,
      batchId: result.batchId ?? batchId,
      taskId: result.batchId ?? batchId,
      status: result.taskStatus,
      message: result.message,
      skipped: result.skipped ?? false,
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : '启动失败'
    console.error('[batch/start] 未捕获异常', {
      batchId,
      teacherId,
      msg,
      stack: error instanceof Error ? error.stack : undefined,
    })
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
