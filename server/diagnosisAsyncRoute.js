import { randomUUID } from 'crypto'
import { createDiagnosisTask, getDiagnosisTaskByTaskId, isDiagnosisTaskStoreConfigured } from './diagnosisTaskStore.js'
import { runDiagnosisOcrStep } from './diagnosisProcessOcr.js'
import { runDiagnosisAnalysisStep } from './diagnosisProcessAnalysis.js'

function buildTaskInput(body) {
  return {
    examType: body.examType,
    subject: body.subject,
    score: body.score,
    fullScore: body.fullScore,
    gradeRank: body.gradeRank,
    confusion: body.confusion?.trim() || '',
    examFileBase64: body.examFileBase64,
    examFileName: body.examFileName,
    answerImages: body.answerImages,
  }
}

/** 本地 Express 诊断路由（与 Vercel api/diagnosis/* 对齐） */
export function registerDiagnosisAsyncRoutes(app) {
  app.post('/api/diagnosis/submit', async (req, res) => {
    if (!isDiagnosisTaskStoreConfigured()) {
      return res.status(503).json({
        success: false,
        message: '请在 .env 配置 VITE_SUPABASE_URL 与 SUPABASE_SERVICE_ROLE_KEY',
      })
    }

    const body = req.body ?? {}
    const imageCount = Array.isArray(body.answerImages) ? body.answerImages.length : 0

    if (!body.examFileBase64 || !body.examFileName) {
      return res.status(400).json({ success: false, message: '请上传标准试卷（Word 或 PDF）' })
    }
    if (!imageCount) {
      return res.status(400).json({ success: false, message: '请至少上传一张学生答题卡图片' })
    }
    if (!body.examType || !body.subject || body.score == null) {
      return res.status(400).json({ success: false, message: '请填写考试类型、学科和分数' })
    }

    const taskId = randomUUID()
    try {
      await createDiagnosisTask({
        taskId,
        userId: body.userId?.trim() || null,
        result: buildTaskInput(body),
      })
      return res.json({
        success: true,
        taskId,
        status: 'processing',
        message: '任务已创建',
      })
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : '提交失败',
      })
    }
  })

  app.get('/api/diagnosis/run-ocr', async (req, res) => {
    const taskId = req.query?.taskId
    if (!taskId) {
      return res.status(400).json({ success: false, message: '缺少 taskId' })
    }
    try {
      const outcome = await runDiagnosisOcrStep(taskId)
      if (!outcome.success && !outcome.skipped) {
        return res.json({
          success: false,
          taskId,
          message: outcome.message || 'OCR 失败',
        })
      }
      return res.json({ success: true, taskId, status: 'ocr_done' })
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'OCR 处理失败',
      })
    }
  })

  app.get('/api/diagnosis/run-analysis', async (req, res) => {
    const taskId = req.query?.taskId
    if (!taskId) {
      return res.status(400).json({ success: false, message: '缺少 taskId' })
    }
    try {
      const outcome = await runDiagnosisAnalysisStep(taskId)
      if (!outcome.success && !outcome.skipped) {
        return res.json({
          success: false,
          taskId,
          message: outcome.message || 'AI 分析失败',
        })
      }
      const stored = outcome.result || {}
      return res.json({
        success: true,
        taskId,
        status: 'completed',
        message: stored.message,
        report: stored.report,
        isMockFallback: stored.isMockFallback ?? false,
      })
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'AI 分析失败',
      })
    }
  })

  app.get('/api/diagnosis/status', async (req, res) => {
    const taskId = req.query?.taskId
    if (!taskId) {
      return res.status(400).json({ success: false, message: '缺少 taskId' })
    }

    try {
      const task = await getDiagnosisTaskByTaskId(taskId)
      if (!task) {
        return res.status(404).json({ success: false, status: 'not_found', message: '任务不存在' })
      }
      if (task.status === 'failed') {
        return res.json({
          success: false,
          taskId,
          status: 'failed',
          message: task.error_message || '诊断任务失败',
        })
      }
      if (task.status === 'completed') {
        const result = task.result || {}
        return res.json({
          success: true,
          taskId,
          status: 'completed',
          report: result.report,
          message: result.message,
        })
      }
      return res.json({ success: true, taskId, status: task.status })
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : '查询失败',
      })
    }
  })
}
