import { generateDiagnosis } from '../../server/diagnosisGenerator.js'
import { prepareDiagnosisComparison } from '../../server/diagnosisPrepare.js'
import { buildApiErrorPayload, buildMockFallbackPayload } from '../../server/apiResponse.js'
import { getDeepSeekConfigSummary, serializeError } from '../../server/deepseekClient.js'

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
    examImageCount: Number(body.answerSheetPageCount) || Number(body.examImageCount) || 0,
  }
}

async function handlePrepare(body, res) {
  const examBytes = body.examFileBase64 ? Buffer.byteLength(body.examFileBase64, 'utf8') : 0
  const imageCount = Array.isArray(body.answerImages) ? body.answerImages.length : 0

  console.log('[api/diagnosis/generate] prepare 请求', {
    examFileName: body.examFileName,
    examFileKB: examBytes ? (examBytes / 1024).toFixed(1) : 0,
    answerImageCount: imageCount,
  })

  if (!body.examFileBase64 || !body.examFileName) {
    return res.status(400).json({ success: false, message: '请上传标准试卷（Word 或 PDF）' })
  }
  if (!imageCount) {
    return res.status(400).json({ success: false, message: '请至少上传一张学生答题卡图片' })
  }

  const result = await prepareDiagnosisComparison(
    {
      examFileBase64: body.examFileBase64,
      examFileName: body.examFileName,
      answerImages: body.answerImages,
    },
    (msg) => console.log('[api/diagnosis/generate] prepare 进度:', msg),
  )

  if (!result.success) {
    return res.status(200).json({
      success: false,
      action: 'prepare',
      isMockFallback: true,
      message: result.message,
      errorDetail: result.errorDetail,
      examPaperText: result.examPaperText,
    })
  }

  return res.status(200).json({
    success: true,
    action: 'prepare',
    examPaperText: result.examPaperText,
    examFileName: result.examFileName,
    answerSheetOcrText: result.answerSheetOcrText,
    ocrIncomplete: result.ocrIncomplete,
    answerSheetPageCount: result.answerSheetPageCount,
    examPaperType: result.examPaperType,
  })
}

async function handleAnalyze(body, res, started) {
  const { examType, subject, score } = body

  if (!examType || !subject || score == null) {
    return res.status(400).json({
      success: false,
      message: '请填写考试类型、学科和分数',
      deepseekConfig: getDeepSeekConfigSummary(),
    })
  }

  const form = buildAnalyzeForm(body)

  console.log('[api/diagnosis/generate] analyze 请求', {
    examPaperLength: form.examPaperText?.length ?? 0,
    answerOcrLength: form.answerSheetOcrText?.length ?? 0,
    ocrIncomplete: form.ocrIncomplete,
  })

  const result = await generateDiagnosis(form)

  console.log('[api/diagnosis/generate] analyze 完成', {
    elapsedMs: Date.now() - started,
    isMockFallback: result.isMockFallback,
    errorDetail: result.errorDetail ?? null,
  })

  if (result.isMockFallback) {
    return res.status(200).json(buildMockFallbackPayload(result))
  }

  return res.status(200).json({
    success: true,
    action: 'analyze',
    message: result.message,
    report: result.report,
    isMockFallback: false,
    errorDetail: null,
    deepseekConfig: getDeepSeekConfigSummary(),
  })
}

export default async function handler(req, res) {
  const started = Date.now()
  const action = req.body?.action || 'analyze'

  console.log('[api/diagnosis/generate] 收到请求', {
    method: req.method,
    action,
    deepseekConfig: getDeepSeekConfigSummary(),
  })

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' })
  }

  const body = req.body ?? {}

  try {
    if (action === 'prepare') {
      return await handlePrepare(body, res)
    }
    return await handleAnalyze(body, res, started)
  } catch (error) {
    console.error('[api/diagnosis/generate] 未捕获异常', serializeError(error))
    const payload = buildApiErrorPayload(error, action === 'prepare' ? '试卷解析或 OCR 失败' : '诊断报告生成失败')
    return res.status(500).json({ ...payload, errorDetail: serializeError(error) })
  }
}

export const config = {
  maxDuration: 60,
}
