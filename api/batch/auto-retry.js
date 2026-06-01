import '../../server/applyUrlShim.js'
import { setNoCacheHeaders } from '../../server/apiResponse.js'
import { listStuckBatchTasks, resetStuckProcessingItems, isBatchStoreConfigured } from '../../server/batch/batchTaskStore.js'
import { startBatchProcessing } from '../../server/batch/batchStart.js'

export default async function handler(req, res) {
  setNoCacheHeaders(res)

  if (!isBatchStoreConfigured()) {
    return res.status(503).json({ success: false, message: 'Supabase 未配置' })
  }

  try {
    const staleMinutes = Number(req.query?.staleMinutes || 10)
    const stuckTasks = await listStuckBatchTasks(staleMinutes)

    const details = []
    let processed = 0
    let failed = 0
    let skipped = 0

    for (const task of stuckTasks) {
      try {
        // 先重置卡在 processing 的分块
        const resetCount = await resetStuckProcessingItems(task.batch_id, staleMinutes)
        if (resetCount > 0) {
          details.push({
            batchId: task.batch_id,
            previousStatus: task.status,
            action: `重置 ${resetCount} 个卡住的 processing 分块 → pending`,
            reason: `超过 ${staleMinutes} 分钟未更新`,
          })
        }

        // 重新触发 worker
        const result = await startBatchProcessing(task.batch_id, task.teacher_id, req)
        if (result.ok && !result.skipped) {
          processed++
          details.push({
            batchId: task.batch_id,
            previousStatus: task.status,
            action: '已重新触发 worker',
            reason: result.message,
          })
        } else if (result.skipped) {
          skipped++
        } else {
          failed++
          details.push({
            batchId: task.batch_id,
            previousStatus: task.status,
            action: '重试失败',
            reason: result.message,
          })
        }
      } catch (taskErr) {
        failed++
        details.push({
          batchId: task.batch_id,
          previousStatus: task.status,
          action: '异常',
          reason: taskErr instanceof Error ? taskErr.message : String(taskErr),
        })
      }
    }

    return res.status(200).json({
      success: true,
      scanned: stuckTasks.length,
      processed,
      failed,
      skipped,
      staleMinutes,
      details,
    })
  } catch (error) {
    console.error('[batch/auto-retry]', error)
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : '自动恢复失败',
    })
  }
}

export const config = {
  maxDuration: 30,
  includeFiles: 'server/**',
}
