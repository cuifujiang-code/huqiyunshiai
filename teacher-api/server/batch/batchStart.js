import { triggerBatchWorker } from './batchTrigger.js'
import {
  countItemsByStatus,
  clearBatchQuestionBank,
  getBatchTaskForTeacher,
  markBatchFailed,
  markBatchRunning,
  resetAllItemsToPending,
  resetBatchTaskToPending,
  resetFailedItemsToPending,
  resetStuckProcessingItems,
} from './batchTaskStore.js'

const STALE_TASK_MINUTES = Number(process.env.BATCH_STALE_MINUTES || 2)
const ZOMBIE_RUNNING_MS = Number(process.env.BATCH_ZOMBIE_MS || 90000)

function isTaskStale(task, staleMinutes = STALE_TASK_MINUTES) {
  if (!task?.updated_at) return true
  const ageMs = Date.now() - new Date(task.updated_at).getTime()
  return ageMs > staleMinutes * 60 * 1000
}

/**
 * 启动或恢复批量拆题 worker（HTTP 单通道触发 /api/batch/worker）。
 */
export async function startBatchProcessing(batchId, teacherId, req) {
  const normalizedBatchId = String(batchId ?? '').trim()
  const normalizedTeacherId = String(teacherId ?? '').trim()
  const rerun = req?.body?.rerun === true || req?.body?.rerun === 'true'

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

  if (rerun && (task.status === 'completed' || task.status === 'partial' || task.status === 'failed')) {
    console.log('[batchStart] 重新拆题：清空题库并重置分块', { batchId: normalizedBatchId, oldStatus: task.status })
    await clearBatchQuestionBank(normalizedBatchId)
    await resetAllItemsToPending(normalizedBatchId)
    await resetBatchTaskToPending(normalizedBatchId)
    task = { ...task, status: 'pending', error_message: null, imported_questions: 0 }
  } else if (task.status === 'failed' || task.status === 'partial') {
    console.log(`[启动前重置] batchId=${normalizedBatchId}，旧状态=${task.status}，已重置为 pending`)
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
    console.log('[batchStart] 已重置卡住分块为 pending', { batchId: normalizedBatchId, resetCount })
    counts = await countItemsByStatus(normalizedBatchId)
  }

  let hasWorkRemaining = counts.pending > 0 || counts.processing > 0
  const taskStale = isTaskStale(task)
  const taskAgeMs = task.updated_at ? Date.now() - new Date(task.updated_at).getTime() : Infinity
  let zombieRunning = task.status === 'running'
    && counts.processing > 0
    && counts.completed === 0
    && counts.failed === 0
    && taskAgeMs > ZOMBIE_RUNNING_MS

  if (zombieRunning) {
    console.warn('[batchStart] 检测到僵尸 running（0 进度长时间 processing），强制重置分块', {
      batchId: normalizedBatchId,
      taskAgeMs,
      counts,
    })
    await resetStuckProcessingItems(normalizedBatchId, 1)
    counts = await countItemsByStatus(normalizedBatchId)
    hasWorkRemaining = counts.pending > 0 || counts.processing > 0
    zombieRunning = false
  }

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
  if (task.status === 'running' && hasWorkRemaining && counts.processing > 0 && !taskStale && resetCount === 0 && !zombieRunning) {
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

  const stuckRunning = task.status === 'running' && hasWorkRemaining && (taskStale || counts.processing === 0 || resetCount > 0 || zombieRunning)

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

  const httpTriggered = await triggerBatchWorker(normalizedBatchId, req)
  if (!httpTriggered.ok) {
    const errMsg = httpTriggered.error || 'Worker 触发失败'
    console.error('[batchStart] HTTP Worker 触发失败', {
      batchId: normalizedBatchId,
      error: errMsg,
      httpStatus: httpTriggered.status,
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

  console.log('[batchStart] HTTP Worker 触发成功', {
    batchId: normalizedBatchId,
    httpStatus: httpTriggered.status,
  })

  return {
    ok: true,
    httpStatus: 202,
    taskStatus: 'running',
    batchId: normalizedBatchId,
    message: stuckRunning ? '检测到卡住任务，已重新触发 worker' : '后台批量拆题已启动',
  }
}
