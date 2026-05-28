import {
  getDecomposeTaskByTaskId,
  markDecomposeTaskCompleted,
  markDecomposeTaskFailed,
  markDecomposeTaskParsed,
} from './decomposeTaskStore.js'
import { aiSplitExamText, parseExamText } from './questionImportService.js'

/** 与 Vercel maxDuration 对齐，避免 8 秒误杀导致偶发超时 */
const PROCESS_TIMEOUT_MS = 55_000

function withTimeout(promise, ms, message) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms)
    promise
      .then((v) => { clearTimeout(timer); resolve(v) })
      .catch((e) => { clearTimeout(timer); reject(e) })
  })
}

/**
 * 拆题任务：解析试卷 → DeepSeek 拆题
 * status 流转：processing → parsed（可选）→ completed / failed
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

  const work = async () => {
    let parsedText = task.result?.parsedText

    if (task.status === 'processing') {
      console.log('[decomposeProcess] 解析试卷', { taskId })
      const buffer = Buffer.from(payload.examFileBase64, 'base64')
      parsedText = await parseExamText(buffer, payload.examFileName)
      await markDecomposeTaskParsed(taskId, parsedText, meta)
    }

    console.log('[decomposeProcess] AI 拆题', { taskId, textLength: parsedText?.length ?? 0 })
    const questions = await aiSplitExamText(parsedText, meta)
    await markDecomposeTaskCompleted(taskId, questions)

    console.log('[decomposeProcess] 完成', { taskId, count: questions.length })
    return { success: true, status: 'completed', questions }
  }

  try {
    return await withTimeout(work(), PROCESS_TIMEOUT_MS, '拆题处理超时（超过55秒），请稍后重试或上传更小文件')
  } catch (error) {
    const message = error instanceof Error ? error.message : '拆题失败'
    console.error('[decomposeProcess] 失败', { taskId, message })
    await markDecomposeTaskFailed(taskId, message)
    return { success: false, status: 'failed', message }
  }
}
