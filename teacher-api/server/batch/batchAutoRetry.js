import {
  countItemsByStatus,
  listStuckBatchTasks,
  markBatchRunning,
  resetFailedItemsToPending,
  resetStuckProcessingItems,
} from './batchTaskStore.js'
import { triggerBatchWorker } from './batchTrigger.js'

const DEFAULT_STALE_MINUTES = Number(process.env.BATCH_AUTO_RETRY_STALE_MINUTES || 5)
const MAX_AUTO_RETRY_ATTEMPTS = Number(process.env.BATCH_AUTO_RETRY_MAX_ATTEMPTS || 3)

/**
 * 扫描并恢复卡住/失败的批量拆题任务
 * 覆盖 status：running|partial|failed
 * - failed 任务：将所有 failed 分块重置为 pending，然后重新触发
 * - running/partial 任务：重置卡住的 processing 分块
 */
export async function runBatchAutoRetry(req, staleMinutes = DEFAULT_STALE_MINUTES) {
  const stuckTasks = await listStuckBatchTasks(staleMinutes)
  const details = []

  for (const task of stuckTasks) {
    const batchId = task.batch_id
    const entry = {
      batchId,
      previousStatus: task.status,
      updatedAt: task.updated_at,
      action: 'skipped',
      reason: '',
    }

    try {
      // 针对 failed 状态的任务：重置 failed 分块为 pending
      let resetCount = 0
      if (task.status === 'failed') {
        resetCount = await resetFailedItemsToPending(batchId)
        console.log('[batchAutoRetry] failed 任务分块已重置', { batchId, resetCount })
      } else {
        resetCount = await resetStuckProcessingItems(batchId, staleMinutes)
      }

      const counts = await countItemsByStatus(batchId)

      if (counts.pending === 0 && counts.processing === 0) {
        entry.action = 'skipped'
        entry.reason = task.status === 'failed' ? 'failed 状态但无分块可重置' : '无待处理分块'
        entry.counts = counts
        details.push(entry)
        continue
      }

      await markBatchRunning(batchId)
      const triggered = await triggerBatchWorker(batchId, req)

      if (triggered.ok) {
        entry.action = 'retried'
        entry.reason = resetCount > 0
          ? `已重置 ${resetCount} 个分块（原状态: ${task.status}）并触发 worker`
          : `已触发 worker（原状态: ${task.status}）`
        entry.counts = counts
        entry.httpStatus = triggered.status
      } else {
        entry.action = 'failed'
        entry.reason = triggered.error || 'worker 触发失败'
        entry.counts = counts
        entry.httpStatus = triggered.status
      }
    } catch (err) {
      entry.action = 'failed'
      entry.reason = err instanceof Error ? err.message : String(err)
    }

    details.push(entry)
  }

  const retried = details.filter((d) => d.action === 'retried').length
  const failed = details.filter((d) => d.action === 'failed').length
  const skipped = details.filter((d) => d.action === 'skipped').length

  console.log('[batchAutoRetry] 完成', {
    staleMinutes,
    scanned: stuckTasks.length,
    retried,
    failed,
    skipped,
  })

  return {
    scanned: stuckTasks.length,
    processed: retried,
    failed,
    skipped,
    staleMinutes,
    details,
  }
}
