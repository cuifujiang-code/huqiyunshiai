import '../server/applyUrlShim.js'
import { applyApiHeaders, handleOptions } from '../server/apiResponse.js'
import {
  countItemsByStatus,
  formatBatchProgress,
  getBatchTaskForTeacher,
  isBatchStoreConfigured,
  listBatchQuestions,
} from '../server/batch/batchTaskStore.js'

export default async function handler(req, res) {
  if (handleOptions(req, res)) return
  applyApiHeaders(req, res)

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' })
  }

  if (!isBatchStoreConfigured()) {
    return res.status(503).json({ success: false, message: 'Supabase 未配置' })
  }

  const batchId = req.method === 'GET' ? req.query?.batchId : req.body?.batchId
  const teacherId = req.method === 'GET' ? req.query?.teacherId : req.body?.teacherId
  const withQuestions = (req.query?.withQuestions ?? req.body?.withQuestions) === 'true'

  if (!batchId || !teacherId) {
    return res.status(400).json({ success: false, message: '缺少 batchId 或 teacherId' })
  }

  try {
    const task = await getBatchTaskForTeacher(batchId, teacherId)
    if (!task) {
      return res.status(404).json({ success: false, message: '任务不存在或无权访问' })
    }

    const counts = await countItemsByStatus(batchId)
    const progress = formatBatchProgress(task, counts)

    const payload = { success: true, progress }

    if (withQuestions && (task.status === 'completed' || task.status === 'partial')) {
      payload.questions = await listBatchQuestions(batchId, teacherId)
    }

    return res.status(200).json(payload)
  } catch (error) {
    console.error('[batch/progress]', error)
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : '查询进度失败',
    })
  }
}

export const config = {
  maxDuration: 10,
}
