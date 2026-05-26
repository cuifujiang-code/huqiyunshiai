import { generateDiagnosis } from './diagnosisGenerator.js'
import { prepareDiagnosisComparison } from './diagnosisPrepare.js'
import { buildApiErrorPayload, buildMockFallbackPayload } from './apiResponse.js'
import { getDeepSeekConfigSummary } from './deepseekClient.js'

function buildAnalyzeForm(body) {
  return {
    examType: body.examType,
    subject: body.subject,
    score: Number(body.score),
    fullScore: Number(body.fullScore) || 100,
    gradeRank: body.gradeRank != null ? Number(body.gradeRank) : undefined,
    confusion: body.confusion?.trim() || '',
    examPaperText: body.examPaperText?.trim() || undefined,
    answerSheetOcrText: body.answerSheetOcrText?.trim() || body.ocrText?.trim() || undefined,
    ocrText: body.answerSheetOcrText?.trim() || body.ocrText?.trim() || undefined,
    ocrIncomplete: Boolean(body.ocrIncomplete),
    examImageCount: Number(body.answerSheetPageCount) || 0,
  }
}

export function registerDiagnosisRoute(app) {
  app.post('/api/diagnosis/generate', async (req, res) => {
    const started = Date.now()
    const body = req.body ?? {}
    const action = body.action || 'analyze'

    console.log('[diagnosis/generate] 收到请求', { action, deepseekConfig: getDeepSeekConfigSummary() })

    try {
      if (action === 'prepare') {
        const result = await prepareDiagnosisComparison({
          examFileBase64: body.examFileBase64,
          examFileName: body.examFileName,
          answerImages: body.answerImages,
        })

        if (!result.success) {
          return res.json({
            success: false,
            isMockFallback: true,
            message: result.message,
            errorDetail: result.errorDetail,
          })
        }

        return res.json({ success: true, ...result })
      }

      const { examType, subject, score } = body
      if (!examType || !subject || score == null) {
        return res.status(400).json({ success: false, message: '请填写考试类型、学科和分数' })
      }

      const form = buildAnalyzeForm(body)
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
        deepseekConfig: getDeepSeekConfigSummary(),
      })
    } catch (error) {
      return res.status(500).json(buildApiErrorPayload(error, '诊断处理失败'))
    }
  })
}
