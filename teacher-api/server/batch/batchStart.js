import { triggerBatchWorker } from './batchTrigger.js'
import {
  countItemsByStatus,
  getBatchTaskForTeacher,
  markBatchFailed,
  markBatchRunning,
} from './batchTaskStore.js'

/**
 * 启动或恢复批量拆题 worker。
 * - pending / failed：正常启动
 * - running 且无 processing、仍有 pending：视为卡住，重新触发
 */
export async function startBatchProcessing(batchId, teacherId, req) {
  const normalizedBatchId = String(batchId ?? '').trim()
  const normalizedTeacherId = String(teacherId ?? '').trim()

  if (!normalizedBatchId || !normalizedTeacherId) {
    return { ok: false, httpStatus: 400, taskStatus: 'failed', message: '缺少 batchId 或 teacherId' }
  }

  const task = await getBatchTaskForTeacher(normalizedBatchId, normalizedTeacherId)
  if (!task) {
    return { ok: false, httpStatus: 404, taskStatus: 'failed', message: '任务不存在或无权访问' }
  }

  if (task.status === 'completed' || task.status === 'partial') {
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
  const stuckRunning =
    task.status === 'running'
    && counts.processing === 0
    && counts.pending > 0
    && counts.completed === 0
    && counts.failed === 0

  const shouldTrigger =
    task.status === 'pending'
    || task.status === 'failed'
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

  console.log('[batchStart] 启动 worker', {
    batchId: normalizedBatchId,
    taskStatus: task.status,
    counts,
    stuckRunning,
  })

  await markBatchRunning(normalizedBatchId)
  const triggered = await triggerBatchWorker(normalizedBatchId, req)

  if (!triggered.ok) {
    const errMsg = triggered.error || 'Worker 触发失败'
    console.error('[batchStart] worker 未启动', { batchId: normalizedBatchId, errMsg })
    await markBatchFailed(normalizedBatchId, errMsg)
    return {
      ok: false,
      httpStatus: 500,
      taskStatus: 'failed',
      batchId: normalizedBatchId,
      message: errMsg,
    }
  }

  return {
    ok: true,
    httpStatus: 200,
    taskStatus: 'running',
    batchId: normalizedBatchId,
    message: stuckRunning ? '检测到卡住任务，已重新触发 worker' : '后台批量拆题已启动',
  }
}
