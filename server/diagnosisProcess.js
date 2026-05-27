import { prepareDiagnosisComparison } from './diagnosisPrepare.js'
import { generateDiagnosis } from './diagnosisGenerator.js'
import { getDiagnosisTaskByTaskId, markDiagnosisTaskCompleted, markDiagnosisTaskFailed } from './diagnosisTaskStore.js'
import { buildMockFallbackPayload } from './apiResponse.js'

const PROCESS_TIMEOUT_MS = 58_000

function withTimeout(promise, ms, message) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms)
    promise
      .then((value) => {
        clearTimeout(timer)
        resolve(value)
      })
      .catch((err) => {
        clearTimeout(timer)
        reject(err)
      })
  })
}

function buildAnalyzeForm(payload, prepareResult) {
  return {
    examType: payload.examType,
    subject: payload.subject,
    score: Number(payload.score),
    fullScore: Number(payload.fullScore) || 100,
    gradeRank: payload.gradeRank != null ? Number(payload.gradeRank) : undefined,
    confusion: payload.confusion?.trim() || '',
    examPaperText: prepareResult.examPaperText,
    answerSheetOcrText: prepareResult.answerSheetOcrText,
    ocrIncomplete: Boolean(prepareResult.ocrIncomplete),
    examImageCount: prepareResult.answerSheetPageCount || payload.answerImages?.length || 0,
  }
}

/**
 * 完整异步诊断：试卷解析 → OCR → DeepSeek 对比分析
 */
export async function runDiagnosisTask(taskId) {
  const task = await getDiagnosisTaskByTaskId(taskId)
  if (!task) {
    throw new Error('任务不存在')
  }
  if (task.status !== 'processing') {
    console.log('[diagnosisProcess] 任务已处理，跳过', { taskId, status: task.status })
    return { skipped: true, status: task.status }
  }

  const payload = task.payload || {}

  const work = async () => {
    console.log('[diagnosisProcess] 开始处理', { taskId })

    const prepareResult = await prepareDiagnosisComparison(
      {
        examFileBase64: payload.examFileBase64,
        examFileName: payload.examFileName,
        answerImages: payload.answerImages,
      },
      (msg) => console.log('[diagnosisProcess] prepare:', msg),
    )

    if (!prepareResult.success) {
      const errMsg = prepareResult.message || '试卷解析或 OCR 识别失败'
      await markDiagnosisTaskFailed(taskId, errMsg)
      return { success: false, status: 'failed', message: errMsg, errorDetail: prepareResult.errorDetail }
    }

    const form = buildAnalyzeForm(payload, prepareResult)
    const analyzeResult = await generateDiagnosis(form)

    const stored = analyzeResult.isMockFallback
      ? buildMockFallbackPayload(analyzeResult)
      : {
          success: true,
          message: analyzeResult.message,
          report: analyzeResult.report,
          isMockFallback: false,
          errorDetail: null,
        }

    await markDiagnosisTaskCompleted(taskId, stored)

    console.log('[diagnosisProcess] 完成', {
      taskId,
      isMockFallback: analyzeResult.isMockFallback,
    })

    return { success: true, status: 'completed', result: stored }
  }

  try {
    return await withTimeout(
      work(),
      PROCESS_TIMEOUT_MS,
      '诊断处理超时（超过60秒），请压缩图片后重试',
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : '诊断处理失败'
    console.error('[diagnosisProcess] 失败', { taskId, message })
    await markDiagnosisTaskFailed(taskId, message)
    return { success: false, status: 'failed', message }
  }
}
