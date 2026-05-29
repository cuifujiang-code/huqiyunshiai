import '../../server/applyUrlShim.js'
import { applyApiHeaders, handleOptions } from '../../server/apiResponse.js'
import {
  countItemsByStatus,
  formatBatchProgress,
  getBatchTaskForTeacher,
  isBatchStoreConfigured,
  listBatchQuestions,
} from '../../server/batch/batchTaskStore.js'

function emptyQuestionsResponse(res, status, body) {
  return res.status(status).json({ ...body, questions: [] })
}

export default async function handler(req, res) {
  if (handleOptions(req, res)) return
  applyApiHeaders(req, res)

  if (req.method !== 'GET' && req.method !== 'POST') {
    return emptyQuestionsResponse(res, 405, { success: false, message: 'Method Not Allowed' })
  }

  if (!isBatchStoreConfigured()) {
    return emptyQuestionsResponse(res, 503, { success: false, message: 'Supabase 未配置' })
  }

  const batchId = req.method === 'GET' ? req.query?.batchId : req.body?.batchId
  const teacherId = req.method === 'GET' ? req.query?.teacherId : req.body?.teacherId
  const withQuestions = (req.query?.withQuestions ?? req.body?.withQuestions) === 'true'

  if (!batchId || !teacherId) {
    return emptyQuestionsResponse(res, 400, { success: false, message: '缺少 batchId 或 teacherId' })
  }

  try {
    const task = await getBatchTaskForTeacher(batchId, teacherId)
    if (!task) {
      return emptyQuestionsResponse(res, 404, { success: false, message: '任务不存在或无权访问' })
    }

    const counts = await countItemsByStatus(batchId)
    const progress = formatBatchProgress(task, counts)

    let questions = []

    if (withQuestions) {
      try {
        const rows = await listBatchQuestions(batchId, teacherId)
        questions = Array.isArray(rows) ? rows : []
      } catch (queryErr) {
        console.error('[batch/progress] batch_question_bank 查询异常', {
          batchId,
          teacherId,
          error: queryErr instanceof Error ? queryErr.message : queryErr,
        })
        questions = []
      }
    }

    console.log('[batch/progress] 响应', {
      batchId,
      teacherId,
      withQuestions,
      taskStatus: task.status,
      questionCount: questions.length,
    })

    return res.status(200).json({
      success: true,
      progress,
      questions,
    })
  } catch (error) {
    console.error('[batch/progress]', error)
    return emptyQuestionsResponse(res, 500, {
      success: false,
      message: error instanceof Error ? error.message : '查询进度失败',
    })
  }
}

export const config = {
  maxDuration: 10,
}
