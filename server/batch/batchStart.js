import { runInBackground } from '../runInBackground.js'
import { triggerBatchWorker } from './batchTrigger.js'
import { safeRunBatchWorker } from './batchWorker.js'
import {
  clearBatchQuestionBank,
  countItemsByStatus,
  getBatchTaskForTeacher,
  markBatchFailed,
  markBatchRunning,
  resetAllItemsToPending,
  resetBatchTaskToPending,
  resetFailedItemsToPending,
  resetStuckProcessingItems,
} from './batchTaskStore.js'

const STALE_TASK_MINUTES = Number(process.env.BATCH_STALE_MINUTES || 2)

async function runWorkerInBackground(batchId, source) {
  try {
    console.log(`[batchStart] [${source}] runInBackground -> safeRunBatchWorker 开始`, { batchId })
    const result = await safeRunBatchWorker(batchId)
    console.log(`[batchStart] [${source}] runInBackground -> safeRunBatchWorker 结束`, { batchId, result })
    if (result?.success === false && result.message) {
      console.error(`[batchStart] [${source}] worker 返回失败`, { batchId, result })
    }
    return result
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[batchStart] [${source}] runInBackground 未捕获异常`, {
      batchId,
      msg,
      stack: err instanceof Error ? err.stack : undefined,
    })
    await markBatchFailed(batchId, msg)
    return { success: false, message: msg }
  }
}

/**
 * 启动或恢复批量拆题 worker。
 * 失败/部分完成任务会先重置 failed 分块再调度 worker。
 */
export async function startBatchProcessing(batchId, teacherId, req) {
  const normalizedBatchId = String(batchId ?? '').trim()
  const normalizedTeacherId = String(teacherId ?? '').trim()
  const rerun = req?.body?.rerun === true || req?.body?.rerun === 'true'

  console.log('[batchStart] 收到启动请求', {
    batchId: normalizedBatchId,
    teacherId: normalizedTeacherId,
    rerun,
    host: req?.headers?.host,
    origin: req?.headers?.origin,
  })

  if (!normalizedBatchId || !normalizedTeacherId) {
    return { ok: false, httpStatus: 400, taskStatus: 'failed', message: '缺少 batchId 或 teacherId' }
  }

  let task = await getBatchTaskForTeacher(normalizedBatchId, normalizedTeacherId)
  if (!task) {
    return { ok: false, httpStatus: 404, taskStatus: 'failed', message: '任务不存在或无权访问' }
  }

  if (rerun && (task.status === 'completed' || task.status === 'partial' || task.status === 'failed')) {
    console.log('[batchStart] 重新拆题：清空题库并重置分块', { batchId: normalizedBatchId, oldStatus: task.status })
    await clearBatchQuestionBank(normalizedBatchId)
    await resetAllItemsToPending(normalizedBatchId)
    await resetBatchTaskToPending(normalizedBatchId)
    task = { ...task, status: 'pending', error_message: null, imported_questions: 0 }
  } else if (task.status === 'failed' || task.status === 'partial') {
    await resetBatchTaskToPending(normalizedBatchId)
    const resetItems = await resetFailedItemsToPending(normalizedBatchId)
    console.log('[batchStart] 已重置 failed 分块', { batchId: normalizedBatchId, resetItems })
    task = { ...task, status: 'pending', error_message: null }
  }

  if (task.status === 'completed' && !rerun) {
    console.log('[batchStart] 任务已完成，跳过', { batchId: normalizedBatchId, status: task.status })
    return {
      ok: true,
      httpStatus: 200,
      taskStatus: task.status,
      batchId: normalizedBatchId,
      message: '任务已完成',
      skipped: true,
    }
  }

  const resetCount = await resetStuckProcessingItems(normalizedBatchId, STALE_TASK_MINUTES)
  let counts = await countItemsByStatus(normalizedBatchId)
  if (resetCount > 0) {
    console.log('[batchStart] 已重置卡住分块', { batchId: normalizedBatchId, resetCount })
    counts = await countItemsByStatus(normalizedBatchId)
  }

  if (task.status === 'partial' && counts.pending === 0 && counts.processing === 0 && !rerun) {
    console.log('[batchStart] 部分完成任务无待处理分块，跳过', { batchId: normalizedBatchId, counts })
    return {
      ok: true,
      httpStatus: 200,
      taskStatus: 'partial',
      batchId: normalizedBatchId,
      message: '任务部分完成，无待处理分块',
      skipped: true,
    }
  }

  const stuckRunning =
    task.status === 'running'
    && counts.processing === 0
    && counts.pending > 0
    && counts.completed === 0
    && counts.failed === 0

  const shouldTrigger =
    task.status === 'pending'
    || task.status === 'failed'
    || task.status === 'partial'
    || stuckRunning
    || (task.status === 'running' && counts.processing === 0 && counts.pending > 0)

  if (task.status === 'running' && !shouldTrigger) {
    console.log('[batchStart] 任务已在处理中，跳过重复触发', {
      batchId: normalizedBatchId,
      counts,
    })
    return {
      ok: true,
      httpStatus: 200,
      taskStatus: 'running',
      batchId: normalizedBatchId,
      message: '任务已在处理中',
      skipped: true,
    }
  }

  console.log('[batchStart] 准备调度 worker', {
    batchId: normalizedBatchId,
    taskStatus: task.status,
    counts,
    stuckRunning,
    dispatch: process.env.BATCH_WORKER_DISPATCH || 'direct',
  })

  await markBatchRunning(normalizedBatchId)

  const useHttpDispatch = process.env.BATCH_WORKER_DISPATCH === 'http'

  if (useHttpDispatch) {
    console.log('[batchStart] 使用 HTTP triggerBatchWorker', { batchId: normalizedBatchId })
    const triggered = await triggerBatchWorker(normalizedBatchId)
    if (!triggered.ok) {
      const errMsg = triggered.error || 'Worker 触发失败'
      console.error('[batchStart] triggerBatchWorker 失败', {
        batchId: normalizedBatchId,
        errMsg,
        httpStatus: triggered.status,
      })
      await markBatchFailed(normalizedBatchId, errMsg)
      return {
        ok: false,
        httpStatus: 500,
        taskStatus: 'failed',
        batchId: normalizedBatchId,
        message: errMsg,
      }
    }
    console.log('[batchStart] triggerBatchWorker 成功', {
      batchId: normalizedBatchId,
      httpStatus: triggered.status,
    })
  } else {
    runInBackground(() => runWorkerInBackground(normalizedBatchId, 'start'))
    console.log('[batchStart] 已通过 runInBackground 调度 worker', { batchId: normalizedBatchId })
  }

  return {
    ok: true,
    httpStatus: 202,
    taskStatus: 'running',
    batchId: normalizedBatchId,
    message: stuckRunning ? '检测到卡住任务，已重新触发 worker' : '后台批量拆题已启动',
  }
}
