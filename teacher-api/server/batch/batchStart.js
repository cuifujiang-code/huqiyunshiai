import { triggerBatchWorker } from './batchTrigger.js'
import {
  countItemsByStatus,
  clearBatchQuestionBank,
  getBatchTaskForTeacher,
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
 * 启动或恢复批量拆题：标记 running 并通过 HTTP 触发 /api/batch/worker
 * Worker 内部循环处理所有分块（无 HTTP 链），由 auto-retry 兜底恢复
 */
export async function startBatchProcessing(batchId, teacherId, req) {
  const normalizedBatchId = String(batchId ?? '').trim()
  const normalizedTeacherId = String(teacherId ?? '').trim()
  const rerun = req?.body?.rerun === true || req?.body?.rerun === 'true'

  console.log('[batchStart] 收到启动请求', {
    batchId: normalizedBatchId,
    teacherId: normalizedTeacherId,
  })

  if (!normalizedBatchId || !normalizedTeacherId) {
    return { ok: false, httpStatus: 400, taskStatus: 'failed', message: '缺少 batchId 或 teacherId' }
  }

  let task = await getBatchTaskForTeacher(normalizedBatchId, normalizedTeacherId)
  if (!task) {
    return { ok: false, httpStatus: 404, taskStatus: 'failed', message: '任务不存在或无权访问' }
  }

  if (rerun && (task.status === 'completed' || task.status === 'partial' || task.status === 'failed')) {
    console.log('[batchStart] 重新拆题：清空题库并重置', { batchId: normalizedBatchId, oldStatus: task.status })
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
    return { ok: true, httpStatus: 200, taskStatus: task.status, batchId: normalizedBatchId, message: '任务已完成', skipped: true }
  }

  const resetCount = await resetStuckProcessingItems(normalizedBatchId, STALE_TASK_MINUTES)
  let counts = await countItemsByStatus(normalizedBatchId)
  if (resetCount > 0) {
    console.log('[batchStart] 已重置卡住分块', { batchId: normalizedBatchId, resetCount })
    counts = await countItemsByStatus(normalizedBatchId)
  }

  let hasWorkRemaining = counts.pending > 0 || counts.processing > 0
  const taskStale = isTaskStale(task)
  const taskAgeMs = task.updated_at ? Date.now() - new Date(task.updated_at).getTime() : Infinity
  let zombieRunning = task.status === 'running'
    && counts.processing > 0 && counts.completed === 0 && counts.failed === 0
    && taskAgeMs > ZOMBIE_RUNNING_MS

  if (zombieRunning) {
    console.warn('[batchStart] 检测到僵尸 running，强制重置', { batchId: normalizedBatchId, taskAgeMs, counts })
    await resetStuckProcessingItems(normalizedBatchId, 1)
    counts = await countItemsByStatus(normalizedBatchId)
    hasWorkRemaining = counts.pending > 0 || counts.processing > 0
    zombieRunning = false
  }

  if (task.status === 'partial' && !hasWorkRemaining) {
    return { ok: true, httpStatus: 200, taskStatus: 'partial', batchId: normalizedBatchId, message: '任务部分完成，无待处理分块', skipped: true }
  }

  if (task.status === 'running' && hasWorkRemaining && counts.processing > 0 && !taskStale && resetCount === 0 && !zombieRunning) {
    return { ok: true, httpStatus: 200, taskStatus: 'running', batchId: normalizedBatchId, message: '任务已在处理中', skipped: true }
  }

  if (task.status === 'running' && !hasWorkRemaining && !taskStale) {
    return { ok: true, httpStatus: 200, taskStatus: 'running', batchId: normalizedBatchId, message: '任务收尾中', skipped: true }
  }

  const stuckRunning = task.status === 'running' && hasWorkRemaining
    && (taskStale || counts.processing === 0 || resetCount > 0 || zombieRunning)

  console.log('[batchStart] 调度 worker', { batchId: normalizedBatchId, taskStatus: task.status, counts, stuckRunning })
  await markBatchRunning(normalizedBatchId)

  // 异步触发 worker（fire-and-forget），不等待结果
  // Worker 内部循环处理所有分块，不再需要 HTTP 链
  triggerBatchWorker(normalizedBatchId, req).then((result) => {
    console.log('[batchStart] Worker 触发结果', { batchId: normalizedBatchId, ok: result.ok, status: result.status })
  }).catch((err) => {
    console.error('[batchStart] Worker 触发异常', { batchId: normalizedBatchId, error: err instanceof Error ? err.message : String(err) })
  })

  return {
    ok: true,
    httpStatus: 202,
    taskStatus: 'running',
    batchId: normalizedBatchId,
    message: stuckRunning ? '检测到卡住任务，已重新触发 worker' : '后台批量拆题已启动',
  }
}
