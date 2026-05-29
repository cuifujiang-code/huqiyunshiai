import { waitUntil } from '@vercel/functions'
import { triggerBatchWorker } from './batchTrigger.js'
import { safeRunBatchWorker } from './batchWorker.js'
import {
  countItemsByStatus,
  getBatchTaskForTeacher,
  markBatchFailed,
  markBatchRunning,
} from './batchTaskStore.js'

async function runWorkerInBackground(batchId, source) {
  try {
    console.log(`[batchStart] [${source}] waitUntil → safeRunBatchWorker 开始`, { batchId })
    const result = await safeRunBatchWorker(batchId)
    console.log(`[batchStart] [${source}] waitUntil → safeRunBatchWorker 结束`, { batchId, result })
    if (result?.success === false && result.message) {
      console.error(`[batchStart] [${source}] worker 返回失败`, { batchId, result })
    }
    return result
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[batchStart] [${source}] waitUntil 未捕获异常`, {
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
 * 优先在同函数内 waitUntil 直接执行（避免 self-fetch 401/URL 错误）；
 * 链式续跑仍走 triggerBatchWorker HTTP。
 */
export async function startBatchProcessing(batchId, teacherId, req) {
  const normalizedBatchId = String(batchId ?? '').trim()
  const normalizedTeacherId = String(teacherId ?? '').trim()

  console.log('[batchStart] 收到启动请求', {
    batchId: normalizedBatchId,
    teacherId: normalizedTeacherId,
    host: req?.headers?.host,
    origin: req?.headers?.origin,
  })

  if (!normalizedBatchId || !normalizedTeacherId) {
    return { ok: false, httpStatus: 400, taskStatus: 'failed', message: '缺少 batchId 或 teacherId' }
  }

  const task = await getBatchTaskForTeacher(normalizedBatchId, normalizedTeacherId)
  if (!task) {
    return { ok: false, httpStatus: 404, taskStatus: 'failed', message: '任务不存在或无权访问' }
  }

  if (task.status === 'completed') {
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

  const counts = await countItemsByStatus(normalizedBatchId)

  if (task.status === 'partial' && counts.pending === 0 && counts.processing === 0) {
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
    const triggered = await triggerBatchWorker(normalizedBatchId, req)
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
    waitUntil(runWorkerInBackground(normalizedBatchId, 'start'))
    console.log('[batchStart] 已通过 waitUntil 直接调度 worker', { batchId: normalizedBatchId })
  }

  return {
    ok: true,
    httpStatus: 202,
    taskStatus: 'running',
    batchId: normalizedBatchId,
    message: stuckRunning ? '检测到卡住任务，已重新触发 worker' : '后台批量拆题已启动',
  }
}
