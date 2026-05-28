import {
  getDecomposeTaskByTaskId,
  markDecomposeTaskCompleted,
  markDecomposeTaskFailed,
  markDecomposeTaskParsed,
  markDecomposeTaskPartialProgress,
} from './decomposeTaskStore.js'
import { aiSplitExamText, parseExamText, splitTextIntoBatches } from './questionImportService.js'

/**
 * 拆题任务：解析试卷 → 分批 AI 拆题（每批更新 partial result）
 * status: processing → parsed → splitting → completed / failed
 */
export async function runDecomposeTask(taskId) {
  const task = await getDecomposeTaskByTaskId(taskId)
  if (!task) throw new Error('任务不存在')

  if (task.status === 'completed') {
    return { skipped: true, status: 'completed', questions: task.result?.questions ?? [] }
  }
  if (task.status === 'failed') {
    return { skipped: true, status: 'failed', message: task.error_message }
  }

  const payload = task.result?.payload
  if (!payload?.examFileBase64 || !payload?.examFileName) {
    await markDecomposeTaskFailed(taskId, '任务缺少试卷文件数据')
    return { success: false, status: 'failed', message: '任务缺少试卷文件数据' }
  }

  const meta = { subject: payload.subject, grade: payload.grade }

  try {
    let parsedText = task.result?.parsedText
    const resumeFromBatch = task.result?.batchProgress?.nextIndex ?? 0
    let startBatchIndex = 0
    let questions = []

    if (!parsedText) {
      console.log('[decomposeProcess] 解析试卷', { taskId })
      const buffer = Buffer.from(payload.examFileBase64, 'base64')
      parsedText = await parseExamText(buffer, payload.examFileName)
      await markDecomposeTaskParsed(taskId, parsedText, meta)
    } else if (task.status === 'splitting' && resumeFromBatch > 0) {
      startBatchIndex = resumeFromBatch
      questions = Array.isArray(task.result?.questions) ? [...task.result.questions] : []
    }

    const batches = splitTextIntoBatches(parsedText)
    console.log('[decomposeProcess] AI 分批拆题', {
      taskId,
      textLength: parsedText.length,
      batchCount: batches.length,
      startBatchIndex,
    })

    for (let i = startBatchIndex; i < batches.length; i++) {
      const batchQuestions = await aiSplitExamText(batches[i], meta)
      questions.push(...batchQuestions)

      await markDecomposeTaskPartialProgress(taskId, {
        payload,
        parsedText,
        meta,
        questions,
        batchProgress: { total: batches.length, completed: i + 1, nextIndex: i + 1 },
      })
    }

    await markDecomposeTaskCompleted(taskId, questions)
    console.log('[decomposeProcess] 完成', { taskId, count: questions.length })
    return { success: true, status: 'completed', questions }
  } catch (error) {
    const message = error instanceof Error ? error.message : '拆题失败'
    console.error('[decomposeProcess] 失败', { taskId, message })
    await markDecomposeTaskFailed(taskId, message)
    return { success: false, status: 'failed', message }
  }
}
