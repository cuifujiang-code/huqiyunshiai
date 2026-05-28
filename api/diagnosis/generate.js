import { generateDiagnosis } from '../../server/diagnosisGenerator.js'
import { prepareDiagnosisComparison } from '../../server/diagnosisPrepare.js'
import { buildApiErrorPayload, buildMockFallbackPayload, setNoCacheHeaders } from '../../server/apiResponse.js'
import { getDeepSeekConfigSummary, serializeError } from '../../server/deepseekClient.js'
import { logStepError, serializeApiError } from '../../server/apiErrorUtil.js'
import { isAlibabaOcrConfigured } from '../../server/alibabaHandwritingOcr.js'
import { OCR_API_VERSION, OCR_ENDPOINT } from '../../server/alibabaOcrHttp.js'

/** OCR：@alicloud/pop-core，endpoint 硬编码杭州，不读 ALIBABA_OCR_ENDPOINT */

export const ALIBABA_OCR_CONFIG = {
  endpoint: OCR_ENDPOINT,
  apiVersion: OCR_API_VERSION,
}

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

/** 业务错误统一返回 200 + JSON，避免前端只能看到 HTTP 500 */
function sendPrepareError(res, { message, errorDetail, step, examPaperText }) {
  return res.status(200).json({
    success: false,
    action: 'prepare',
    isMockFallback: true,
    message: message || '试卷解析或 OCR 识别失败',
    errorDetail,
    step: step || 'prepare',
    examPaperText,
  })
}

async function handlePrepare(body, res) {
  const examBytes = body.examFileBase64 ? Buffer.byteLength(body.examFileBase64, 'utf8') : 0
  const imageCount = Array.isArray(body.answerImages) ? body.answerImages.length : 0

  console.log('[OCR诊断] 使用endpoint:', OCR_ENDPOINT)
  console.log('[api/diagnosis/generate] prepare 请求', {
    examFileName: body.examFileName,
    examFileKB: examBytes ? (examBytes / 1024).toFixed(1) : 0,
    answerImageCount: imageCount,
    ocrMode: 'pop-core',
    ocrEndpoint: ALIBABA_OCR_CONFIG.endpoint,
    ocrApiVersion: ALIBABA_OCR_CONFIG.apiVersion,
    alibabaOcrConfigured: isAlibabaOcrConfigured(),
  })

  if (!body.examFileBase64 || !body.examFileName) {
    return res.status(400).json({ success: false, message: '请上传标准试卷（Word 或 PDF）' })
  }
  if (!imageCount) {
    return res.status(400).json({ success: false, message: '请至少上传一张学生答题卡图片' })
  }

  try {
    const result = await prepareDiagnosisComparison(
      {
        examFileBase64: body.examFileBase64,
        examFileName: body.examFileName,
        answerImages: body.answerImages,
      },
      (msg) => console.log('[api/diagnosis/generate] prepare 进度:', msg),
    )

    if (!result.success) {
      return sendPrepareError(res, {
        message: result.message,
        errorDetail: result.errorDetail,
        step: result.step,
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
  } catch (error) {
    const errorDetail = logStepError('prepare-unhandled', error)
    return sendPrepareError(res, {
      message: error instanceof Error ? error.message : '诊断准备失败',
      errorDetail,
      step: 'prepare-unhandled',
    })
  }
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

  try {
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
  } catch (error) {
    const errorDetail = logStepError('analyze-unhandled', error)
    return res.status(200).json({
      success: false,
      action: 'analyze',
      isMockFallback: true,
      message: error instanceof Error ? error.message : 'AI 分析失败',
      errorDetail,
    })
  }
}

export default async function handler(req, res) {
  setNoCacheHeaders(res)
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
    const errorDetail = serializeApiError(error)
    logStepError('handler-fatal', error)

    return res.status(200).json({
      success: false,
      action,
      isMockFallback: true,
      message: error instanceof Error ? error.message : '服务器处理失败',
      errorDetail,
      ...buildApiErrorPayload(error, '诊断服务异常'),
    })
  }
}

export const config = {
  maxDuration: 60,
}
