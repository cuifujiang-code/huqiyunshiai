import { serializeError } from '../deepseekClient.js'
import { forceDecomposeAndInsert } from './robustDecomposer.js'
import {
  countItemsByStatus,
  emergencyRecover,
  fetchPendingItems,
  finalizeBatchTaskFromDatabase,
  getBatchTask,
  markBatchFailed,
  markBatchRunning,
  markItemCompleted,
  markItemFailed,
  markItemProcessing,
  recoverTaskStatusFromBankCount,
  resetStuckProcessingItems,
  forceResetAllProcessingItems,
  syncImportedQuestionsFromBank,
  updateBatchProgress,
} from './batchTaskStore.js'

const ITEMS_PER_ROUND = Math.min(Number(process.env.BATCH_ITEMS_PER_RUN || 2), 10)
const BATCH_MAX_DURATION_SEC = Number(process.env.BATCH_MAX_DURATION || 300)
const SAFE_TIMEOUT_MS = Math.max((BATCH_MAX_DURATION_SEC - 30) * 1000, 30 * 1000)

function isTimeUp(startMs) {
  return Date.now() - startMs > SAFE_TIMEOUT_MS
}

/** 标记 failed 前先查 batch_question_bank，有题则强制 completed */
async function safeMarkBatchFailed(batchId, message, counts = {}) {
  try {
    const recovery = await recoverTaskStatusFromBankCount(batchId, counts)
    if (recovery.corrected) {
      console.log('[batchWorker] 跳过 markBatchFailed，数据库兜底已修正', {
        batchId, realCount: recovery.realCount, status: recovery.status,
      })
      return recovery.status
    }
  } catch (err) {
    console.error('[batchWorker] recoverTaskStatusFromBankCount 失败', {
      batchId, err: err instanceof Error ? err.message : String(err),
    })
  }
  await markBatchFailed(batchId, message)
  return 'failed'
}

/** 完全基于 batch_question_bank 真实 COUNT 判断任务最终状态 */
async function resolveFinalBatchStatus(batchId, counts) {
  if (counts.pending > 0 || counts.processing > 0) return null
  try {
    const { realCount, status } = await finalizeBatchTaskFromDatabase(batchId, counts)
    if (realCount > 0 && status !== 'failed') return status
    const recovery = await recoverTaskStatusFromBankCount(batchId, counts)
    if (recovery.corrected) return recovery.status
    return status
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[batchWorker] finalizeBatchTaskFromDatabase 失败', { batchId, msg })
    return safeMarkBatchFailed(batchId, msg, counts)
  }
}

/** 单分块：调用稳健拆题核心 forceDecomposeAndInsert */
async function processOneItem(item, meta, batchId, teacherId) {
  console.log('[batchWorker] 开始处理分块', {
    itemId: item.id, itemIndex: item.item_index,
    chunkLength: item.chunk_text?.length ?? 0,
  })
  await markItemProcessing(item.id)

  try {
    const result = await forceDecomposeAndInsert(
      batchId, teacherId, item.chunk_text, meta.subject, meta.grade,
      { itemId: item.id, formulaImages: meta.formulaImages, images: meta.images },
    )

    console.log('[batchWorker] decompose 结果', {
      batchId, itemId: item.id, itemIndex: item.item_index,
      success: result.success, skipped: result.skipped ?? false,
      insertedCount: result.insertedCount, model: result.model,
      error: result.error ?? null,
    })

    if (result.skipped || result.skippedFragment) {
      await markItemCompleted(item.id, [])
      return { success: true, skipped: true, itemId: item.id, insertedCount: 0, questions: [] }
    }

    if (!result.success || result.insertedCount === 0) {
      const detailMsg = result.error || '稳健拆题未返回有效题目'
      await markItemFailed(item.id, detailMsg)
      return { success: false, error: detailMsg, itemId: item.id, insertedCount: 0, questions: [], skipTaskFail: true }
    }

    await markItemCompleted(item.id, result.questions)
    return { success: true, itemId: item.id, insertedCount: result.insertedCount, questions: result.questions }
  } catch (error) {
    const msg = error instanceof Error ? error.message : '拆题失败'
    console.error('[batchWorker] 分块处理异常', { itemId: item.id, batchId, msg, detail: serializeError(error) })
    const isDataIssue = /文本为空|缺少 batchId|缺少 teacherId|chunk_text/i.test(msg)
    if (isDataIssue) {
      await markItemFailed(item.id, msg)
    } else {
      // 保持 processing 状态，等待 auto-retry cron 恢复
      console.warn('[batchWorker] 分块保持 processing，等待 auto-retry', { itemId: item.id, batchId, msg })
    }
    return { success: false, error: msg, itemId: item.id, insertedCount: 0, questions: [], skipTaskFail: !isDataIssue }
  }
}

/** 串行处理一批分块（避免 DeepSeek 并发超时） */
async function runPool(items, meta, batchId, teacherId) {
  const results = []
  for (const item of items) {
    const outcome = await processOneItem(item, meta, batchId, teacherId)
    results.push(outcome)
    console.log('[batchWorker] 分块完成', { batchId, itemIndex: item.item_index, success: outcome.success, insertedCount: outcome.insertedCount ?? 0 })
  }
  await syncImportedQuestionsFromBank(batchId)
  return results
}

/**
 * 核心 Worker：单次函数调用内循环处理所有 pending 分块
 * 不再依赖 HTTP 链式触发，避免 Vercel Hobby Plan 并发排队死锁
 */
async function runBatchWorkerCore(batchId) {
  console.log(`[Worker] 开始处理 batchId=${batchId}`)
  try {
  const startMs = Date.now()
  let totalProcessed = 0
  let roundNum = 0

  const resetCount = await resetStuckProcessingItems(batchId, Number(process.env.BATCH_STALE_MINUTES || 3))
  if (resetCount > 0) console.log('[batchWorker] 已重置卡住分块', { batchId, resetCount })

  const task = await getBatchTask(batchId)
  if (!task) throw new Error('批量任务不存在')

  console.log('[batchWorker] 任务快照', { batchId, status: task.status, totalItems: task.total_items, teacherId: task.teacher_id, importedQuestions: task.imported_questions })

  if (task.status === 'completed') {
    console.log('[batchWorker] 任务已完成，跳过', { batchId })
    return { skipped: true, status: 'completed' }
  }

  const meta = {
    subject: task.subject, grade: task.grade,
    formulaImages: (task.meta?.formulaImages || task.meta?.formula_images || []),
    images: (task.meta?.images || task.meta?.extracted_images || []),
  }

  if (task.status === 'pending') {
    console.log('[batchWorker] 标记任务 running', { batchId })
    await markBatchRunning(batchId)
  }

  // === 主循环：处理所有 pending 分块 ===
  while (true) {
    roundNum++

    // 超时检查：在超时前 30 秒停止处理新分块，留出收尾时间
    if (isTimeUp(startMs)) {
      console.warn('[batchWorker] 即将超时，停止处理新分块', {
        batchId, roundNum, elapsedSec: Math.round((Date.now() - startMs) / 1000),
        totalProcessed, maxDurationSec: BATCH_MAX_DURATION_SEC,
      })
      break
    }

    const pending = await fetchPendingItems(batchId, ITEMS_PER_ROUND)
    if (!pending.length) {
      // 检查是否有卡住的 processing 分块
      const counts = await countItemsByStatus(batchId)
      if (counts.processing > 0) {
        const forced = await resetStuckProcessingItems(batchId, 1)
        if (forced > 0) {
          console.log('[batchWorker] 重置卡住分块后继续', { batchId, forced })
          continue // retry with newly reset items
        }
        // 仍有 processing 但无法重置：强制全部重置
        const forcedAll = await forceResetAllProcessingItems(batchId)
        if (forcedAll > 0) {
          console.log('[batchWorker] 强制重置全部 processing→pending', { batchId, forcedAll })
          continue
        }
      }

      // 完成收尾
      const finalStatus = await resolveFinalBatchStatus(batchId, counts)
      console.log('[batchWorker] 全部完成', { batchId, finalStatus, counts, totalProcessed, roundNum })
      return { done: true, status: finalStatus ?? task.status, counts, totalProcessed }
    }

    console.log(`[batchWorker] 第${roundNum}轮，处理${pending.length}个分块`, { batchId })
    const roundResults = await runPool(pending, meta, batchId, task.teacher_id)
    totalProcessed += pending.length

    const counts = await countItemsByStatus(batchId)
    const doneChunks = counts.completed + counts.failed
    await updateBatchProgress(batchId, { completedItems: doneChunks, status: 'running' })

    const elapsedSec = Math.round((Date.now() - startMs) / 1000)
    console.log(`[batchWorker] 第${roundNum}轮完成，进度=${doneChunks}/${(task.total_items||0)}，耗时=${elapsedSec}s`, {
      batchId, counts, remaining: counts.pending + counts.processing,
    })

    if (counts.pending === 0 && counts.processing === 0) {
      const finalStatus = await resolveFinalBatchStatus(batchId, counts)
      console.log('[batchWorker] 全部完成（无剩余分块）', { batchId, finalStatus, totalProcessed, roundNum })
      return { done: true, status: finalStatus ?? task.status, counts, totalProcessed }
    }
  }

  // 超时安全退出：统计当前状态
  const finalCounts = await countItemsByStatus(batchId)
  console.log('[batchWorker] 超时安全退出', {
    batchId, totalProcessed, roundNum,
    remaining: finalCounts.pending + finalCounts.processing,
    elapsedSec: Math.round((Date.now() - startMs) / 1000),
  })

  if (totalProcessed === 0) {
    // 一个都没处理成功，标记失败
    await markBatchFailed(batchId, 'Worker 超时：未完成任何分块处理')
    return { done: true, status: 'failed', counts: finalCounts, totalProcessed: 0, timeout: true }
  }

  // 有部分完成：保持 running，等待 auto-retry 或者用户手动触发
  return { done: true, status: 'running', counts: finalCounts, totalProcessed, timeout: true, message: '部分完成（超时），剩余分块等待下次触发' }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    const stack = error instanceof Error ? error.stack : undefined
    console.error('=== Worker 主循环遇到未捕获异常 ===')
    console.error(msg)
    console.error(stack)
    try {
      await markBatchFailed(batchId, msg)
    } catch (markErr) {
      console.error('[batchWorker] markBatchFailed 失败', {
        batchId,
        err: markErr instanceof Error ? markErr.message : String(markErr),
      })
    }
    return { done: true, status: 'failed', message: msg }
  }
}

export async function safeRunBatchWorker(batchId) {
  console.log(`[Worker] safeRun 开始 batchId=${batchId}`)
  try {
    const result = await runBatchWorkerCore(batchId)
    const isFailed = result?.status === 'failed' || result?.success === false
    if (isFailed) {
      const msg = result?.message || 'Worker 处理失败'
      console.error(`[Worker] 处理失败 batchId=${batchId}`, { result, msg })
      const correctedStatus = await safeMarkBatchFailed(batchId, msg, result?.counts ?? {})
      if (correctedStatus !== 'failed') {
        return { ...result, status: correctedStatus, recovered: true }
      }
    } else {
      console.log(`[Worker] 处理完成 batchId=${batchId}`, {
        status: result?.status, totalProcessed: result?.totalProcessed, timeout: result?.timeout,
      })
    }
    return result
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    const stack = error instanceof Error ? error.stack : undefined
    console.error('=== Worker 处理遇到未捕获异常 ===')
    console.error(`batchId=${batchId}`)
    console.error(msg)
    console.error(stack)
    try {
      await markBatchFailed(batchId, msg)
    } catch (markErr) {
      console.error('[batchWorker] markBatchFailed 失败', {
        batchId,
        err: markErr instanceof Error ? markErr.message : String(markErr),
      })
    }
    try { return await emergencyRecover(batchId, msg) } catch {
      return { success: false, message: msg, status: 'failed', recovered: false }
    }
  }
}
