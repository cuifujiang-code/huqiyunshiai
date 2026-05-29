import '../../server/applyUrlShim.js'
import { applyApiHeaders, handleOptions } from '../../server/apiResponse.js'
import { triggerBatchWorker } from '../../server/batch/batchTrigger.js'
import { getBatchTaskForTeacher, isBatchStoreConfigured, markBatchFailed, markBatchRunning } from '../../server/batch/batchTaskStore.js'

export default async function handler(req, res) {
  if (handleOptions(req, res)) return
  applyApiHeaders(req, res)

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
    if (task.status === 'completed' || task.status === 'running') {
      return res.status(200).json({
        success: true,
        batchId,
        status: task.status,
        message: task.status === 'running' ? '任务已在处理中' : '任务已完成',
      })
    }

    await markBatchRunning(batchId)
    const triggered = await triggerBatchWorker(batchId, req)
    if (!triggered.ok) {
      const errMsg = triggered.error || 'Worker 触发失败'
      console.error('[batch/start] worker 未启动', { batchId, errMsg })
      await markBatchFailed(batchId, errMsg)
      return res.status(500).json({
        success: false,
        batchId,
        message: errMsg,
      })
    }

    return res.status(200).json({
      success: true,
      batchId,
      status: 'running',
      message: '后台批量拆题已启动，请通过 /batch/progress 查看进度',
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
  maxDuration: 10,
}
