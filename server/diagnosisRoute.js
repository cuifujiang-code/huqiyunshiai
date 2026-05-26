import { generateDiagnosis } from './diagnosisGenerator.js'
import {
  completeDiagnosisJob,
  createDiagnosisJob,
  failDiagnosisJob,
  getDiagnosisJob,
} from './diagnosisJobs.js'
import { buildApiErrorPayload, buildMockFallbackPayload } from './apiResponse.js'
import { getDeepSeekConfigSummary } from './deepseekClient.js'

function buildForm(body) {
  return {
    examType: body.examType,
    subject: body.subject,
    score: Number(body.score),
    fullScore: Number(body.fullScore) || 100,
    gradeRank: body.gradeRank != null ? Number(body.gradeRank) : undefined,
    confusion: body.confusion?.trim() || '',
    examImageBase64: body.examImageBase64 || undefined,
    examImageMimeType: body.examImageMimeType || undefined,
  }
}

function logIncoming(body) {
  const imageBytes = body.examImageBase64 ? Buffer.byteLength(body.examImageBase64, 'utf8') : 0
  console.log('[diagnosis/generate] 收到请求', {
    hasImage: Boolean(body.examImageBase64),
    imageBase64KB: imageBytes ? (imageBytes / 1024).toFixed(1) : 0,
    async: Boolean(body.async),
    deepseekConfig: getDeepSeekConfigSummary(),
  })
}

async function runDiagnosis(form) {
  const started = Date.now()
  const result = await generateDiagnosis(form)
  console.log('[diagnosis/generate] 完成', { elapsedMs: Date.now() - started, isMockFallback: result.isMockFallback })
  return result
}

export function registerDiagnosisRoute(app) {
  app.post('/api/diagnosis/generate', async (req, res) => {
    const body = req.body ?? {}
    logIncoming(body)

    const { examType, subject, score } = body
    if (!examType || !subject || score == null) {
      return res.status(400).json({ success: false, message: '请填写考试类型、学科和分数' })
    }

    const form = buildForm(body)
    const useAsync = Boolean(body.async) || Boolean(form.examImageBase64)

    try {
      if (useAsync) {
        const jobId = createDiagnosisJob()
        runDiagnosis(form)
          .then((result) => completeDiagnosisJob(jobId, result))
          .catch((error) => failDiagnosisJob(jobId, error))

        return res.status(202).json({
          success: true,
          async: true,
          jobId,
          status: 'processing',
          message: '正在上传并分析试卷，请稍候...',
          deepseekConfig: getDeepSeekConfigSummary(),
        })
      }

      const result = await runDiagnosis(form)
      if (result.isMockFallback) {
        return res.json(buildMockFallbackPayload(result))
      }
      return res.json({
        success: true,
        message: result.message,
        report: result.report,
        isMockFallback: false,
        errorDetail: null,
        deepseekConfig: getDeepSeekConfigSummary(),
      })
    } catch (error) {
      return res.status(500).json(buildApiErrorPayload(error, '诊断报告生成失败'))
    }
  })

  app.get('/api/diagnosis/job', (req, res) => {
    const jobId = req.query?.jobId
    if (!jobId) {
      return res.status(400).json({ success: false, message: '缺少 jobId 参数' })
    }

    const job = getDiagnosisJob(String(jobId))
    if (!job) {
      return res.status(404).json({ success: false, status: 'not_found', message: '任务不存在或已过期' })
    }

    if (job.status === 'processing') {
      return res.json({ success: true, status: 'processing', jobId, message: '正在上传并分析试卷...' })
    }

    if (job.status === 'failed') {
      return res.json({ success: false, status: 'failed', jobId, message: job.error || '诊断任务失败' })
    }

    const result = job.result
    if (result?.isMockFallback) {
      return res.json({ ...buildMockFallbackPayload(result), async: true, jobId, status: 'done' })
    }

    return res.json({
      success: true,
      status: 'done',
      jobId,
      message: result?.message,
      report: result?.report,
      isMockFallback: false,
    })
  })
}
