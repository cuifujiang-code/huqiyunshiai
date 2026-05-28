import '../../server/applyUrlShim.js'
import { getDiagnosisTaskByTaskId, isDiagnosisTaskStoreConfigured } from '../../server/diagnosisTaskStore.js'
import { setNoCacheHeaders } from '../../server/apiResponse.js'

const STATUS_MESSAGES = {
  processing: '正在识别答题卡...',
  ocr_done: 'AI正在对比分析...',
}

export default async function handler(req, res) {
  setNoCacheHeaders(res)
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' })
  }

  if (!isDiagnosisTaskStoreConfigured()) {
    return res.status(503).json({
      success: false,
      message: '诊断服务未配置 Supabase',
    })
  }

  const taskId = req.method === 'GET' ? req.query?.taskId : req.body?.taskId

  if (!taskId || typeof taskId !== 'string') {
    return res.status(400).json({ success: false, message: '缺少 taskId 参数' })
  }

  try {
    const task = await getDiagnosisTaskByTaskId(taskId)

    if (!task) {
      return res.status(404).json({
        success: false,
        status: 'not_found',
        taskId,
        message: '任务不存在',
      })
    }

    if (task.status === 'processing' || task.status === 'ocr_done') {
      return res.status(200).json({
        success: true,
        taskId,
        status: task.status,
        message: STATUS_MESSAGES[task.status] || '诊断处理中...',
      })
    }

    if (task.status === 'failed') {
      return res.status(200).json({
        success: false,
        taskId,
        status: 'failed',
        message: task.error_message || '诊断任务失败',
        error_message: task.error_message,
      })
    }

    const result = task.result || {}
    return res.status(200).json({
      success: result.success !== false,
      taskId,
      status: 'completed',
      message: result.message,
      report: result.report,
      isMockFallback: result.isMockFallback ?? false,
      errorDetail: result.errorDetail ?? null,
    })
  } catch (error) {
    console.error('[api/diagnosis/status] 查询失败', error)
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : '查询任务状态失败',
    })
  }
}
