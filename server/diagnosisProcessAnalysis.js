import { generateDiagnosis } from './diagnosisGenerator.js'
import {
  getDiagnosisTaskByTaskId,
  markDiagnosisTaskCompleted,
  markDiagnosisTaskFailed,
} from './diagnosisTaskStore.js'
import { buildMockFallbackPayload } from './apiResponse.js'

const ANALYSIS_TIMEOUT_MS = 9_000

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

function buildAnalyzeForm(taskInput, ocrResult) {
  return {
    examType: taskInput.examType,
    subject: taskInput.subject,
    score: Number(taskInput.score),
    fullScore: Number(taskInput.fullScore) || 100,
    gradeRank: taskInput.gradeRank != null ? Number(taskInput.gradeRank) : undefined,
    confusion: taskInput.confusion?.trim() || '',
    examPaperText: ocrResult.examPaperText,
    answerSheetOcrText: ocrResult.answerSheetOcrText,
    ocrIncomplete: Boolean(ocrResult.ocrIncomplete),
    examImageCount: ocrResult.answerSheetPageCount || taskInput.answerImages?.length || 0,
  }
}

/**
 * 步骤二：DeepSeek 对比分析
 */
export async function runDiagnosisAnalysisStep(taskId) {
  const task = await getDiagnosisTaskByTaskId(taskId)
  if (!task) {
    throw new Error('任务不存在')
  }
  if (task.status !== 'ocr_done') {
    console.log('[diagnosisProcessAnalysis] 跳过', { taskId, status: task.status })
    if (task.status === 'completed') {
      return { skipped: true, success: true, status: 'completed', result: task.result }
    }
    return { skipped: true, status: task.status }
  }

  const taskInput = task.result || {}
  const ocrResult = task.ocr_result || {}

  if (!ocrResult.examPaperText && !ocrResult.answerSheetOcrText) {
    const errMsg = '缺少 OCR 结果，无法进行分析'
    await markDiagnosisTaskFailed(taskId, errMsg)
    return { success: false, status: 'failed', message: errMsg }
  }

  const work = async () => {
    console.log('[diagnosisProcessAnalysis] 开始', { taskId })

    const form = buildAnalyzeForm(taskInput, ocrResult)
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

    console.log('[diagnosisProcessAnalysis] 完成', {
      taskId,
      isMockFallback: analyzeResult.isMockFallback,
    })

    return { success: true, status: 'completed', result: stored }
  }

  try {
    return await withTimeout(work(), ANALYSIS_TIMEOUT_MS, 'AI 分析超时（超过10秒），请稍后重试')
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AI 分析失败'
    console.error('[diagnosisProcessAnalysis] 失败', { taskId, message })
    await markDiagnosisTaskFailed(taskId, message)
    return { success: false, status: 'failed', message }
  }
}
