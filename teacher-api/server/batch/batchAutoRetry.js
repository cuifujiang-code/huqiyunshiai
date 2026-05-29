import {
  countItemsByStatus,
  listStuckBatchTasks,
  markBatchRunning,
  resetStuckProcessingItems,
} from './batchTaskStore.js'
import { triggerBatchWorker } from './batchTrigger.js'

const DEFAULT_STALE_MINUTES = Number(process.env.BATCH_AUTO_RETRY_STALE_MINUTES || 10)

/**
 * 扫描并恢复卡住的批量拆题任务（status=running|partial 且 updated_at 超时）
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
      const resetCount = await resetStuckProcessingItems(batchId, staleMinutes)
      const counts = await countItemsByStatus(batchId)

      if (counts.pending === 0 && counts.processing === 0) {
        entry.action = 'skipped'
        entry.reason = '无待处理分块'
        entry.counts = counts
        details.push(entry)
        continue
      }

      await markBatchRunning(batchId)
      const triggered = await triggerBatchWorker(batchId, req)

      if (triggered.ok) {
        entry.action = 'retried'
        entry.reason = resetCount > 0 ? `已重置 ${resetCount} 个卡住分块并触发 worker` : '已触发 worker'
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
