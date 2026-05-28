import '../server/applyUrlShim.js'
import {
  getDecomposeTaskByTaskId,
  isDecomposeTaskStoreConfigured,
} from '../server/teacher/decomposeTaskStore.js'
import { applyApiHeaders, handleOptions } from '../server/apiResponse.js'

export default async function handler(req, res) {
  if (handleOptions(req, res)) return
  applyApiHeaders(req, res)

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' })
  }

  if (!isDecomposeTaskStoreConfigured()) {
    return res.status(503).json({ success: false, message: 'Supabase 未配置' })
  }

  const taskId = req.method === 'GET' ? req.query?.taskId : req.body?.taskId
  if (!taskId || typeof taskId !== 'string') {
    return res.status(400).json({ success: false, message: '缺少 taskId' })
  }

  try {
    const task = await getDecomposeTaskByTaskId(taskId)
    if (!task) {
      return res.status(404).json({ success: false, status: 'not_found', message: '任务不存在' })
    }

    if (task.status === 'processing' || task.status === 'parsed' || task.status === 'splitting') {
      const batchProgress = task.result?.batchProgress
      const progressMsg = task.status === 'splitting' && batchProgress
        ? `AI 拆题中（${batchProgress.completed}/${batchProgress.total} 批）...`
        : task.status === 'parsed'
          ? '试卷已解析，AI 正在拆题...'
          : '拆题中...'
      return res.status(200).json({
        success: true,
        taskId,
        status: task.status,
        message: progressMsg,
        batchProgress,
        questionCount: task.result?.questions?.length ?? 0,
        updated_at: task.updated_at,
      })
    }

    if (task.status === 'failed') {
      return res.status(200).json({
        success: false,
        taskId,
        status: 'failed',
        message: task.error_message || '拆题失败',
        error_message: task.error_message,
        updated_at: task.updated_at,
      })
    }

    const questions = task.result?.questions ?? []
    return res.status(200).json({
      success: true,
      taskId,
      status: 'completed',
      questions,
      message: `已拆分 ${questions.length} 道题目`,
      updated_at: task.updated_at,
    })
  } catch (error) {
    console.error('[decompose-status] 查询失败', error)
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : '查询失败',
    })
  }
}

export const config = {
  maxDuration: 60,
}
