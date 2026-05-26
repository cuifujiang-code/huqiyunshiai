import { generateDiagnosis } from '../../server/diagnosisGenerator.js'
import {
  completeDiagnosisJob,
  createDiagnosisJob,
  failDiagnosisJob,
} from '../../server/diagnosisJobs.js'
import { buildApiErrorPayload, buildMockFallbackPayload } from '../../server/apiResponse.js'
import { getDeepSeekConfigSummary } from '../../server/deepseekClient.js'

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

function logIncomingRequest(body) {
  const imageBytes = body.examImageBase64 ? Buffer.byteLength(body.examImageBase64, 'utf8') : 0
  console.log('[api/diagnosis/generate] 收到请求', {
    examType: body.examType,
    subject: body.subject,
    hasImage: Boolean(body.examImageBase64),
    imageBase64Bytes: imageBytes,
    imageBase64KB: imageBytes ? (imageBytes / 1024).toFixed(1) : 0,
    async: Boolean(body.async),
    deepseekConfig: getDeepSeekConfigSummary(),
  })
}

async function runDiagnosis(form) {
  const started = Date.now()
  const result = await generateDiagnosis(form)
  console.log('[api/diagnosis/generate] 处理完成', {
    elapsedMs: Date.now() - started,
    isMockFallback: result.isMockFallback,
  })
  return result
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' })
  }

  const body = req.body ?? {}
  logIncomingRequest(body)

  const { examType, subject, score } = body

  if (!examType || !subject || score == null) {
    return res.status(400).json({
      success: false,
      message: '请填写考试类型、学科和分数',
      deepseekConfig: getDeepSeekConfigSummary(),
    })
  }

  const form = buildForm(body)
  const useAsync = Boolean(body.async) || Boolean(form.examImageBase64)

  try {
    if (useAsync) {
      const jobId = createDiagnosisJob()

      let waitUntilFn = null
      try {
        const vercelFunctions = await import('@vercel/functions')
        waitUntilFn = vercelFunctions.waitUntil
      } catch {
        console.warn('[api/diagnosis/generate] @vercel/functions 不可用，异步任务将在同进程后台执行')
      }

      const task = runDiagnosis(form)
        .then((result) => completeDiagnosisJob(jobId, result))
        .catch((error) => failDiagnosisJob(jobId, error))

      if (waitUntilFn) {
        waitUntilFn(task)
      } else {
        task.catch((err) => console.error('[api/diagnosis/generate] 后台任务失败', err))
      }

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
      return res.status(200).json(buildMockFallbackPayload(result))
    }

    return res.status(200).json({
      success: true,
      message: result.message,
      report: result.report,
      isMockFallback: false,
      errorDetail: null,
      deepseekConfig: getDeepSeekConfigSummary(),
    })
  } catch (error) {
    const payload = buildApiErrorPayload(error, '诊断报告生成失败')
    return res.status(500).json(payload)
  }
}

export const config = {
  maxDuration: 60,
}
