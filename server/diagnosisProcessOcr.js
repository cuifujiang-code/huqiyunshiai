import { prepareDiagnosisComparison } from './diagnosisPrepare.js'
import {
  getDiagnosisTaskByTaskId,
  markDiagnosisTaskFailed,
  markDiagnosisTaskOcrDone,
} from './diagnosisTaskStore.js'

const OCR_TIMEOUT_MS = 9_000

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

/**
 * 步骤一：解析试卷 + 阿里云手写 OCR
 */
export async function runDiagnosisOcrStep(taskId) {
  const task = await getDiagnosisTaskByTaskId(taskId)
  if (!task) {
    throw new Error('任务不存在')
  }
  if (task.status !== 'processing') {
    console.log('[diagnosisProcessOcr] 跳过', { taskId, status: task.status })
    if (task.status === 'ocr_done' || task.status === 'completed') {
      return { skipped: true, success: true, status: task.status }
    }
    return { skipped: true, status: task.status }
  }

  const taskInput = task.result || {}

  const work = async () => {
    console.log('[diagnosisProcessOcr] 开始', { taskId })

    const prepareResult = await prepareDiagnosisComparison(
      {
        examFileBase64: taskInput.examFileBase64,
        examFileName: taskInput.examFileName,
        answerImages: taskInput.answerImages,
      },
      (msg) => console.log('[diagnosisProcessOcr]', msg),
    )

    if (!prepareResult.success) {
      const errMsg = prepareResult.message || '试卷解析或 OCR 识别失败'
      await markDiagnosisTaskFailed(taskId, errMsg)
      return { success: false, status: 'failed', message: errMsg, errorDetail: prepareResult.errorDetail }
    }

    const ocrResult = {
      examPaperText: prepareResult.examPaperText,
      examFileName: prepareResult.examFileName,
      answerSheetOcrText: prepareResult.answerSheetOcrText,
      ocrIncomplete: prepareResult.ocrIncomplete,
      answerSheetPageCount: prepareResult.answerSheetPageCount,
      examPaperType: prepareResult.examPaperType,
    }

    await markDiagnosisTaskOcrDone(taskId, ocrResult)

    console.log('[diagnosisProcessOcr] 完成', { taskId })

    return { success: true, status: 'ocr_done', ocrResult }
  }

  try {
    return await withTimeout(work(), OCR_TIMEOUT_MS, 'OCR 识别超时（超过10秒），请压缩图片后重试')
  } catch (error) {
    const message = error instanceof Error ? error.message : 'OCR 处理失败'
    console.error('[diagnosisProcessOcr] 失败', { taskId, message })
    await markDiagnosisTaskFailed(taskId, message)
    return { success: false, status: 'failed', message }
  }
}
