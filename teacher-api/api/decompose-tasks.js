import '../server/applyUrlShim.js'
import {
  formatDecomposeTaskSummary,
  isDecomposeTaskStoreConfigured,
  listDecomposeTasksByTeacher,
  resetDecomposeTaskForRetry,
  getDecomposeTaskByTaskId,
} from '../server/teacher/decomposeTaskStore.js'
import { triggerDecomposeProcess } from '../server/teacher/decomposeTrigger.js'
import { applyApiHeaders, handleOptions } from '../server/apiResponse.js'

export default async function handler(req, res) {
  if (handleOptions(req, res)) return
  applyApiHeaders(req, res)

  if (!isDecomposeTaskStoreConfigured()) {
    return res.status(503).json({ success: false, message: 'Supabase 未配置' })
  }

  if (req.method === 'GET') {
    const teacherId = req.query?.teacherId
    if (!teacherId || typeof teacherId !== 'string') {
      return res.status(400).json({ success: false, message: '缺少 teacherId' })
    }

    try {
      const tasks = await listDecomposeTasksByTeacher(teacherId)
      return res.status(200).json({
        success: true,
        tasks: tasks.map(formatDecomposeTaskSummary),
      })
    } catch (error) {
      console.error('[decompose-tasks] 列表失败', error)
      return res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : '查询任务列表失败',
      })
    }
  }

  if (req.method === 'POST') {
    const { taskId, teacherId } = req.body ?? {}
    if (!taskId || !teacherId) {
      return res.status(400).json({ success: false, message: '缺少 taskId 或 teacherId' })
    }

    try {
      const task = await getDecomposeTaskByTaskId(taskId)
      if (!task) {
        return res.status(404).json({ success: false, message: '任务不存在' })
      }
      if (task.teacher_id !== teacherId) {
        return res.status(403).json({ success: false, message: '无权操作此任务' })
      }
      const resumable = new Set(['failed', 'processing', 'parsed', 'splitting'])
      if (!resumable.has(task.status)) {
        return res.status(400).json({ success: false, message: '当前状态不可重新拆题' })
      }

      if (task.status === 'parsed' || task.status === 'splitting') {
        triggerDecomposeProcess(taskId)
        return res.status(200).json({
          success: true,
          taskId,
          status: task.status,
          message: '已继续后台拆题，请稍后刷新',
        })
      }

      await resetDecomposeTaskForRetry(taskId)
      triggerDecomposeProcess(taskId)

      return res.status(200).json({
        success: true,
        taskId,
        status: 'processing',
        message: '已重新提交拆题任务',
      })
    } catch (error) {
      console.error('[decompose-tasks] 重试失败', error)
      return res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : '重新拆题失败',
      })
    }
  }

  return res.status(405).json({ success: false, message: 'Method Not Allowed' })
}

export const config = {
  maxDuration: 10,
}
