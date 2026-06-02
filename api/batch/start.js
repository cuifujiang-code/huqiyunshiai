import '../../server/applyUrlShim.js'
import { setNoCacheHeaders } from '../../server/apiResponse.js'
import { startBatchProcessing } from '../../server/batch/batchStart.js'
import { getBatchTaskForTeacher, isBatchStoreConfigured } from '../../server/batch/batchTaskStore.js'

export default async function handler(req, res) {
  setNoCacheHeaders(res)

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' })
  }

  if (!isBatchStoreConfigured()) {
    return res.status(503).json({ success: false, message: 'Supabase 未配置' })
  }

  const { batchId, teacherId } = req.body ?? {}
  if (!batchId || !teacherId) {
    return res.status(400).json({ success: false, message: '缺少 batchId 或 teacherId' })
  }

  try {
    const task = await getBatchTaskForTeacher(batchId, teacherId)
    if (!task) {
      return res.status(404).json({ success: false, message: '任务不存在或无权访问' })
    }
    if (task.status === 'completed') {
      return res.status(200).json({
        success: true, batchId, status: 'completed',
        message: '任务已完成',
      })
    }

    // 使用统一的 startBatchProcessing，内部自动 waitUntil
    const result = await startBatchProcessing(batchId, teacherId, req)

    if (!result.ok) {
      return res.status(result.httpStatus || 500).json({
        success: false, batchId,
        status: result.taskStatus || 'failed',
        message: result.message || '启动失败',
      })
    }

    return res.status(200).json({
      success: true, batchId,
      status: result.taskStatus || 'running',
      message: result.skipped
        ? `${result.message || '任务已在处理中'}`
        : '后台批量拆题已启动，请通过 /api/batch/progress 查看进度',
    })
  } catch (error) {
    console.error('[batch/start]', error)
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : '启动失败',
    })
  }
}

export const config = {
  maxDuration: 30,
}
