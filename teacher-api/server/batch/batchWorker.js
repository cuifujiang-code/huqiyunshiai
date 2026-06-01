import { waitUntil } from '@vercel/functions'
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
  syncImportedQuestionsFromBank,
  updateBatchProgress,
} from './batchTaskStore.js'
import { triggerBatchWorker } from './batchTrigger.js'

const CONCURRENCY = Number(process.env.BATCH_AI_CONCURRENCY || 2)
const ITEMS_PER_INVOCATION = Number(process.env.BATCH_ITEMS_PER_RUN || 3)

const CHAIN_INITIAL_DELAY_MS = 2000
const CHAIN_RETRY_DELAY_STEP_MS = 2000
const CHAIN_MAX_RETRIES = 2

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** 标记 failed 前先查 batch_question_bank，有题则强制 completed */
async function safeMarkBatchFailed(batchId, message, counts = {}) {
  try {
    const recovery = await recoverTaskStatusFromBankCount(batchId, counts)
    if (recovery.corrected) {
      console.log('[batchWorker] 跳过 markBatchFailed，已由数据库兜底修正', {
        batchId,
        realCount: recovery.realCount,
        status: recovery.status,
        originalMessage: message,
      })
      return recovery.status
    }
  } catch (err) {
    console.error('[batchWorker] recoverTaskStatusFromBankCount 失败', {
      batchId,
      err: err instanceof Error ? err.message : String(err),
    })
  }
  await markBatchFailed(batchId, message)
  return 'failed'
}

/** 完全基于 batch_question_bank 真实 COUNT 判断任务最终状态 */
async function resolveFinalBatchStatus(batchId, counts) {
  if (counts.pending > 0 || counts.processing > 0) {
    return null
  }

  try {
    const { realCount, status } = await finalizeBatchTaskFromDatabase(batchId, counts)
    if (realCount > 0 && status !== 'failed') {
      return status
    }
    const recovery = await recoverTaskStatusFromBankCount(batchId, counts)
    if (recovery.corrected) return recovery.status
    return status
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[batchWorker] finalizeBatchTaskFromDatabase 失败', { batchId, msg })
    return safeMarkBatchFailed(batchId, msg, counts)
  }
}

/** 链式触发下一轮 worker（HTTP 优先，失败则 waitUntil 直调兜底） */
async function chainNextWorker(batchId, roundNum, remainingChunks, roundItems = [], roundResults = []) {
  const chunkSummary = roundItems.map((item, idx) => {
    const result = roundResults[idx]
    return {
      itemIndex: item.item_index,
      itemId: item.id,
      status: result?.success ? 'completed' : (result?.error ? 'failed' : 'unknown'),
      questionCount: result?.insertedCount ?? 0,
    }
  })
  console.log(`[batchWorker] 第${roundNum}轮完成，剩余${remainingChunks}个分块`, {
    batchId,
    roundNum,
    remainingChunks,
    chunkSummary,
  })

  let delayMs = CHAIN_INITIAL_DELAY_MS
  let lastError = '链式 worker 触发失败'

  for (let attempt = 0; attempt <= CHAIN_MAX_RETRIES; attempt++) {
    console.log('[batchWorker] 链式触发下一轮', {
      batchId,
      roundNum,
      attempt: attempt + 1,
      maxAttempts: CHAIN_MAX_RETRIES + 1,
      delayMs,
      remainingChunks,
    })
    await sleep(delayMs)
    delayMs += CHAIN_RETRY_DELAY_STEP_MS

    const result = await triggerBatchWorker(batchId)
    if (result.ok) {
      console.log('[batchWorker] 链式 HTTP 触发成功', { batchId, roundNum, attempt: attempt + 1 })
      return
    }

    lastError = result.error || lastError
    console.error('[batchWorker] 链式 HTTP 触发失败', { batchId, roundNum, attempt: attempt + 1, error: lastError })
  }

  console.warn('[batchWorker] 链式 HTTP 全部失败，改用 waitUntil 直调下一轮', { batchId, roundNum, lastError })
  waitUntil(
    (async () => {
      console.log(`[Worker] waitUntil 链式续跑开始 batchId=${batchId}，第${roundNum + 1}轮`)
      await safeRunBatchWorker(batchId)
    })(),
  )
}

/** 单分块：调用稳健拆题核心 forceDecomposeAndInsert */
async function processOneItem(item, meta, batchId, teacherId) {
  console.log('[batchWorker] 开始处理分块（robustDecomposer）', {
    itemId: item.id,
    itemIndex: item.item_index,
    chunkLength: item.chunk_text?.length ?? 0,
  })
  await markItemProcessing(item.id)

  try {
    const result = await forceDecomposeAndInsert(
      batchId,
      teacherId,
      item.chunk_text,
      meta.subject,
      meta.grade,
    )

    console.log('[batchWorker] forceDecomposeAndInsert 结果', {
      batchId,
      itemId: item.id,
      itemIndex: item.item_index,
      success: result.success,
      insertedCount: result.insertedCount,
      parsedCount: result.parsedCount,
      realCount: result.realCount,
      status: result.status,
      model: result.model,
      error: result.error ?? null,
    })

    if (!result.success || result.insertedCount === 0) {
      // 如果 AI 层面已经重试过但失败了，不再重复
      const detailMsg = result.error || '稳健拆题未返回有效题目'
      await markItemFailed(item.id, detailMsg)
      return {
        success: false,
        error: detailMsg,
        itemId: item.id,
        insertedCount: 0,
        questions: [],
        skipTaskFail: true,
      }
    }

    await markItemCompleted(item.id, result.questions)
    return {
      success: true,
      itemId: item.id,
      insertedCount: result.insertedCount,
      questions: result.questions,
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : '拆题失败'
    const detail = serializeError(error)
    console.error('[batchWorker] 分块处理失败', {
      itemId: item.id,
      itemIndex: item.item_index,
      batchId,
      msg,
      detail,
    })
    // 不立即 markItemFailed，而是将其保持 processing 状态
    // 让 auto-retry cron 在下一轮扫描时重置并重试
    // 仅当明确是数据问题（如文本为空）时才直接标记 failed
    const isDataIssue = /文本为空|缺少 batchId|缺少 teacherId|chunk_text/i.test(msg)
    if (isDataIssue) {
      await markItemFailed(item.id, msg)
    } else {
      // 保持 processing 状态，等待 auto-retry cron 超时后重置重试
      console.warn('[batchWorker] 分块保持 processing 状态，等待 auto-retry 恢复', {
        itemId: item.id,
        batchId,
        msg,
      })
    }
    return {
      success: false,
      error: msg,
      itemId: item.id,
      insertedCount: 0,
      questions: [],
      skipTaskFail: !isDataIssue, // 非数据问题：跳过任务级 failed
    }
  }
}

async function runPool(items, meta, batchId, teacherId) {
  const results = []

  for (let i = 0; i < items.length; i += CONCURRENCY) {
    const slice = items.slice(i, i + CONCURRENCY)
    console.log('[batchWorker] 并发批次稳健拆题', {
      batchFrom: i,
      batchSize: slice.length,
      itemIndexes: slice.map((it) => it.item_index),
    })

    const settled = await Promise.all(
      slice.map((item) => processOneItem(item, meta, batchId, teacherId)),
    )
    results.push(...settled)

    console.log('[batchWorker] 并发批次稳健拆题完成', {
      batchId,
      batchFrom: i,
      outcomes: settled.map((r, j) => ({
        itemIndex: slice[j]?.item_index,
        itemId: r.itemId,
        success: r.success,
        insertedCount: r.insertedCount ?? 0,
        error: r.error ?? null,
      })),
    })
  }

  await syncImportedQuestionsFromBank(batchId)
  console.log('[batchWorker] 本轮已同步任务题目数', { batchId })

  return results
}

/**
 * 核心 Worker：每轮处理 ITEMS_PER_INVOCATION 个 pending 分块，调用稳健拆题核心
 */
export async function runBatchWorker(batchId) {
  try {
    return await runBatchWorkerCore(batchId)
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[batchWorker] === 全局异常捕获 ===', {
      batchId,
      msg,
      stack: error instanceof Error ? error.stack : undefined,
    })
    return emergencyRecover(batchId, msg)
  }
}

async function runBatchWorkerCore(batchId) {
  console.log(`[Worker] 开始处理 batchId=${batchId}`)

  const resetCount = await resetStuckProcessingItems(batchId, Number(process.env.BATCH_STALE_MINUTES || 3))
  if (resetCount > 0) {
    console.log('[batchWorker] 已重置卡住分块', { batchId, resetCount })
  }

  const task = await getBatchTask(batchId)
  if (!task) throw new Error('批量任务不存在')

  console.log('[batchWorker] 任务快照', {
    batchId,
    status: task.status,
    totalItems: task.total_items,
    teacherId: task.teacher_id,
    importedQuestions: task.imported_questions,
  })

  if (task.status === 'completed') {
    console.log('[batchWorker] 任务已完成，跳过', { batchId })
    return { skipped: true, status: 'completed' }
  }

  const meta = { subject: task.subject, grade: task.grade }

  if (task.status === 'pending') {
    console.log('[batchWorker] 标记任务 running', { batchId })
    await markBatchRunning(batchId)
  }

  const pending = await fetchPendingItems(batchId, ITEMS_PER_INVOCATION)
  console.log('[batchWorker] 待处理分块', { batchId, pendingCount: pending.length })

  if (!pending.length) {
    const counts = await countItemsByStatus(batchId)
    const finalStatus = await resolveFinalBatchStatus(batchId, counts)
    console.log('[batchWorker] 无待处理分块，收尾', { batchId, finalStatus, counts })
    return { done: true, status: finalStatus ?? task.status, counts }
  }

  const roundResults = await runPool(pending, meta, batchId, task.teacher_id)

  const counts = await countItemsByStatus(batchId)
  const doneChunks = counts.completed + counts.failed
  const roundNum = Math.max(1, Math.ceil(doneChunks / ITEMS_PER_INVOCATION))
  const remainingChunks = counts.pending + counts.processing
  console.log('[batchWorker] 本轮完成，更新进度', { batchId, counts, roundNum, remainingChunks })
  await updateBatchProgress(batchId, {
    completedItems: doneChunks,
    status: 'running',
  })

  if (counts.pending > 0 || counts.processing > 0) {
    await chainNextWorker(batchId, roundNum, remainingChunks, pending, roundResults)
    return { continued: true, processed: pending.length, counts, roundNum, remainingChunks }
  }

  const finalStatus = await resolveFinalBatchStatus(batchId, counts)
  console.log('[batchWorker] 全部完成', { batchId, finalStatus, counts })
  return { done: true, status: finalStatus ?? 'failed', counts }
}

export async function safeRunBatchWorker(batchId) {
  console.log(`[Worker] 开始处理 batchId=${batchId}`)
  try {
    const result = await runBatchWorker(batchId)
    const isFailed = result?.status === 'failed'
      || (result?.recovered === false && result?.status === 'failed')
      || result?.success === false

    if (isFailed) {
      const msg = result?.message || 'Worker 处理失败'
      console.error(`[Worker] 处理失败 batchId=${batchId}`, { result, msg })
      const correctedStatus = await safeMarkBatchFailed(batchId, msg, result?.counts ?? {})
      if (correctedStatus !== 'failed') {
        return { ...result, status: correctedStatus, recovered: true }
      }
    } else {
      console.log(`[Worker] 处理完成 batchId=${batchId}`, { result })
    }
    return result
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Worker 异常'
    console.error(`[Worker] 处理失败 batchId=${batchId}`, { msg, stack: error instanceof Error ? error.stack : undefined })
    try {
      await safeMarkBatchFailed(batchId, msg)
    } catch (markErr) {
      console.error('[Worker] markBatchFailed 失败', { batchId, markErr })
    }
    try {
      return await emergencyRecover(batchId, msg)
    } catch (recoverErr) {
      console.error('[batchWorker] emergencyRecover 也失败', {
        batchId,
        msg: recoverErr instanceof Error ? recoverErr.message : String(recoverErr),
      })
      return { success: false, message: msg, status: 'failed', recovered: false }
    }
  }
}
