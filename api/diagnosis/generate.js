import { generateDiagnosis } from '../../server/diagnosisGenerator.js'
import { buildApiErrorPayload, buildMockFallbackPayload } from '../../server/apiResponse.js'
import { getDeepSeekConfigSummary, serializeError } from '../../server/deepseekClient.js'

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

export default async function handler(req, res) {
  const started = Date.now()

  console.log('[api/diagnosis/generate] 收到请求', {
    method: req.method,
    deepseekConfig: getDeepSeekConfigSummary(),
  })

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' })
  }

  const body = req.body ?? {}

  console.log('[api/diagnosis/generate] 请求参数', {
    examType: body.examType,
    subject: body.subject,
    score: body.score,
    fullScore: body.fullScore,
    gradeRank: body.gradeRank,
    examImageCount: body.examImageCount ?? 0,
    ocrLength: body.ocrText?.length ?? 0,
    ocrIncomplete: Boolean(body.ocrIncomplete),
    ocrPreview: body.ocrText ? body.ocrText.slice(0, 200) : null,
    confusionLength: body.confusion?.length ?? 0,
  })

  const { examType, subject, score } = body

  if (!examType || !subject || score == null) {
    return res.status(400).json({
      success: false,
      message: '请填写考试类型、学科和分数',
      deepseekConfig: getDeepSeekConfigSummary(),
    })
  }

  try {
    const form = buildForm(body)

    console.log('[api/diagnosis/generate] 开始调用 generateDiagnosis（OCR 文本 + DeepSeek）')
    const result = await generateDiagnosis(form)

    console.log('[api/diagnosis/generate] 处理完成', {
      elapsedMs: Date.now() - started,
      isMockFallback: result.isMockFallback,
      errorDetail: result.errorDetail ?? null,
    })

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
    console.error('[api/diagnosis/generate] 未捕获异常', serializeError(error))
    const payload = buildApiErrorPayload(error, '诊断报告生成失败')
    return res.status(500).json(payload)
  }
}

export const config = {
  maxDuration: 60,
}
