import { generateDiagnosis } from './diagnosisGenerator.js'
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
    ocrText: body.ocrText?.trim() || undefined,
    ocrIncomplete: Boolean(body.ocrIncomplete),
    examImageCount: Number(body.examImageCount) || 0,
  }
}

export function registerDiagnosisRoute(app) {
  app.post('/api/diagnosis/generate', async (req, res) => {
    const started = Date.now()
    const body = req.body ?? {}

    console.log('[diagnosis/generate] 收到请求', {
      examType: body.examType,
      subject: body.subject,
      examImageCount: body.examImageCount ?? 0,
      ocrLength: body.ocrText?.length ?? 0,
      ocrIncomplete: Boolean(body.ocrIncomplete),
      deepseekConfig: getDeepSeekConfigSummary(),
    })

    const { examType, subject, score } = body
    if (!examType || !subject || score == null) {
      return res.status(400).json({ success: false, message: '请填写考试类型、学科和分数' })
    }

    try {
      const form = buildForm(body)
      const result = await generateDiagnosis(form)

      console.log('[diagnosis/generate] 完成', {
        elapsedMs: Date.now() - started,
        isMockFallback: result.isMockFallback,
      })

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
}
