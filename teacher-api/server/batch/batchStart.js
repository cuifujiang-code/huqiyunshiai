import { waitUntil } from '@vercel/functions'
import { triggerBatchWorker } from './batchTrigger.js'
import { safeRunBatchWorker } from './batchWorker.js'
import {
  countItemsByStatus,
  emergencyRecover,
  getBatchTaskForTeacher,
  markBatchFailed,
  markBatchRunning,
  resetBatchTaskToPending,
  resetStuckProcessingItems,
} from './batchTaskStore.js'

const STALE_TASK_MINUTES = Number(process.env.BATCH_STALE_MINUTES || 3)

function isTaskStale(task, staleMinutes = STALE_TASK_MINUTES) {
  if (!task?.updated_at) return true
  const ageMs = Date.now() - new Date(task.updated_at).getTime()
  return ageMs > staleMinutes * 60 * 1000
}

async function runWorkerInBackground(batchId, source) {
  try {
    console.log(`[batchStart] [${source}] waitUntil → safeRunBatchWorker 开始`, { batchId })
    const result = await safeRunBatchWorker(batchId)
    console.log(`[batchStart] [${source}] waitUntil → safeRunBatchWorker 结束`, { batchId, result })
    if (result?.recovered === false && result?.status === 'failed') {
      console.error(`[batchStart] [${source}] worker 恢复后仍为 failed`, { batchId, result })
    }
    return result
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[batchStart] [${source}] waitUntil 未捕获异常`, {
      batchId,
      msg,
      stack: err instanceof Error ? err.stack : undefined,
    })
    return emergencyRecover(batchId, msg)
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

  let task = await getBatchTaskForTeacher(normalizedBatchId, normalizedTeacherId)
  if (!task) {
    return { ok: false, httpStatus: 404, taskStatus: 'failed', message: '任务不存在或无权访问' }
  }

  if (task.status === 'failed' || task.status === 'partial') {
    console.log(`[启动前重置] batchId=${normalizedBatchId}，旧状态=${task.status}，已重置为 pending`)
    await resetBatchTaskToPending(normalizedBatchId)
    task = { ...task, status: 'pending', error_message: null }
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

  const resetCount = await resetStuckProcessingItems(normalizedBatchId, STALE_TASK_MINUTES)
  let counts = await countItemsByStatus(normalizedBatchId)
  if (resetCount > 0) {
    console.log('[batchStart] 已重置卡住分块为 pending', { batchId: normalizedBatchId, resetCount })
    counts = await countItemsByStatus(normalizedBatchId)
  }

  const hasWorkRemaining = counts.pending > 0 || counts.processing > 0
  const taskStale = isTaskStale(task)

  if (task.status === 'partial' && !hasWorkRemaining) {
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

  // running 且近期有分块在 processing：视为活跃 worker，避免重复触发
  if (task.status === 'running' && hasWorkRemaining && counts.processing > 0 && !taskStale && resetCount === 0) {
    console.log('[batchStart] 任务活跃处理中，跳过重复触发', {
      batchId: normalizedBatchId,
      counts,
      updatedAt: task.updated_at,
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

  // running 但无剩余分块且未超时：等待上一轮收尾
  if (task.status === 'running' && !hasWorkRemaining && !taskStale) {
    console.log('[batchStart] running 无剩余分块，跳过', { batchId: normalizedBatchId, counts })
    return {
      ok: true,
      httpStatus: 200,
      taskStatus: 'running',
      batchId: normalizedBatchId,
      message: '任务收尾中',
      skipped: true,
    }
  }

  const stuckRunning = task.status === 'running' && hasWorkRemaining && (taskStale || counts.processing === 0 || resetCount > 0)

  console.log('[batchStart] 准备调度 worker', {
    batchId: normalizedBatchId,
    taskStatus: task.status,
    counts,
    stuckRunning,
    taskStale,
    resetCount,
  })

  console.log(`[启动] 正在触发 Worker，batchId=${normalizedBatchId}`)
  await markBatchRunning(normalizedBatchId)

  // 双通道触发：waitUntil 直调 + HTTP 备用，避免 Worker 未被调度
  waitUntil(runWorkerInBackground(normalizedBatchId, 'start-waitUntil'))
  console.log('[batchStart] 已通过 waitUntil 调度 safeRunBatchWorker', { batchId: normalizedBatchId })

  const httpTriggered = await triggerBatchWorker(normalizedBatchId, req)
  if (httpTriggered.ok) {
    console.log('[batchStart] HTTP Worker 触发成功', { batchId: normalizedBatchId, httpStatus: httpTriggered.status })
  } else {
    console.warn('[batchStart] HTTP Worker 触发失败，已依赖 waitUntil 直调', {
      batchId: normalizedBatchId,
      error: httpTriggered.error,
      httpStatus: httpTriggered.status,
    })
  }

  return {
    ok: true,
    httpStatus: 202,
    taskStatus: 'running',
    batchId: normalizedBatchId,
    message: stuckRunning ? '检测到卡住任务，已重新触发 worker' : '后台批量拆题已启动',
  }
}
