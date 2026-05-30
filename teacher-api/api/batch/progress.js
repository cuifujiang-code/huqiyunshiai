import '../../server/applyUrlShim.js'
import { applyApiHeaders, handleOptions } from '../../server/apiResponse.js'
import {
  countItemsByStatus,
  formatBatchProgress,
  getBatchTaskForTeacher,
  isBatchStoreConfigured,
  listBatchQuestions,
} from '../../server/batch/batchTaskStore.js'

/** 保证所有分支都返回 JSON，且 questions 恒为数组 */
function jsonResponse(res, status, payload = {}) {
  if (res.headersSent) {
    console.error('[batch/progress] 响应头已发送，跳过重复写入', payload)
    return
  }

  const errorText =
    payload.error
    ?? (payload.success === false && payload.message ? payload.message : undefined)

  const body = {
    success: payload.success ?? (status >= 200 && status < 400),
    questions: Array.isArray(payload.questions) ? payload.questions : [],
    ...payload,
  }

  if (errorText && body.error == null) {
    body.error = errorText
  }

  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  return res.status(status).json(body)
}

function parseWithQuestions(req) {
  const raw = req.query?.withQuestions ?? req.body?.withQuestions
  return raw === true || raw === 'true' || raw === '1'
}

export default async function handler(req, res) {
  try {
    if (handleOptions(req, res)) return
    applyApiHeaders(req, res)

    console.log('[batch/progress] 请求', {
      method: req.method,
      url: req.url,
      query: req.query,
    })

    if (req.method !== 'GET' && req.method !== 'POST') {
      return jsonResponse(res, 405, {
        success: false,
        error: 'Method Not Allowed',
        message: 'Method Not Allowed',
      })
    }

    if (!isBatchStoreConfigured()) {
      return jsonResponse(res, 503, {
        success: false,
        error: 'Supabase 未配置：请设置 SUPABASE_URL 与 SUPABASE_SERVICE_ROLE_KEY',
        message: 'Supabase 未配置',
      })
    }

    const batchId = String(
      (req.method === 'GET' ? req.query?.batchId : req.body?.batchId) ?? '',
    ).trim()
    const teacherId = String(
      (req.method === 'GET' ? req.query?.teacherId : req.body?.teacherId) ?? '',
    ).trim()
    const withQuestions = parseWithQuestions(req)

    if (!batchId || !teacherId) {
      return jsonResponse(res, 400, {
        success: false,
        error: '缺少 batchId 或 teacherId',
        message: '缺少 batchId 或 teacherId',
      })
    }

    // batch_decompose_tasks
    const task = await getBatchTaskForTeacher(batchId, teacherId)
    if (!task) {
      return jsonResponse(res, 404, {
        success: false,
        error: '任务不存在或无权访问',
        message: '任务不存在或无权访问',
      })
    }

    const counts = await countItemsByStatus(batchId)
    const progress = formatBatchProgress(task, counts)
    let questions = []

    if (withQuestions) {
      console.log('[batch/progress] 查询 batch_question_bank', { batchId, teacherId })
      try {
        const rows = await listBatchQuestions(batchId, teacherId)
        questions = Array.isArray(rows) ? rows : []
      } catch (queryErr) {
        const errMsg = queryErr instanceof Error ? queryErr.message : String(queryErr)
        console.error('[batch/progress] batch_question_bank 查询失败', {
          batchId,
          teacherId,
          error: errMsg,
        })
        return jsonResponse(res, 500, {
          success: false,
          error: `batch_question_bank 查询失败: ${errMsg}`,
          message: '查询题目失败',
          progress,
          questions: [],
        })
      }
    }

    console.log('[batch/progress] 响应', {
      batchId,
      teacherId,
      withQuestions,
      taskStatus: task.status,
      questionCount: questions.length,
    })

    return jsonResponse(res, 200, {
      success: true,
      progress,
      questions,
    })
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error)
    console.error('[batch/progress] 未捕获异常', {
      error: errMsg,
      stack: error instanceof Error ? error.stack : undefined,
    })
    return jsonResponse(res, 500, {
      success: false,
      error: errMsg,
      message: '查询进度失败',
      questions: [],
    })
  }
}

export const config = {
  maxDuration: 10,
  includeFiles: 'server/**',
}
