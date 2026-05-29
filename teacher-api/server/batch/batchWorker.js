import { callDeepSeekAI, extractJson } from '../deepseekClient.js'
import { safeJsonParse } from './safeJson.js'
import { BATCH_SYSTEM_PROMPT, buildBatchSplitPrompt, normalizeBatchQuestions } from './batchPrompt.js'
import {
  countItemsByStatus,
  fetchPendingItems,
  getBatchTask,
  insertBatchQuestions,
  markBatchCompleted,
  markBatchFailed,
  markBatchRunning,
  markItemCompleted,
  markItemFailed,
  markItemProcessing,
  updateBatchProgress,
} from './batchTaskStore.js'
import { triggerBatchWorker } from './batchTrigger.js'

const CONCURRENCY = Number(process.env.BATCH_AI_CONCURRENCY || 5)
const ITEMS_PER_INVOCATION = Number(process.env.BATCH_ITEMS_PER_RUN || 8)
const BATCH_MODEL = process.env.DEEPSEEK_BATCH_MODEL || process.env.DEEPSEEK_MODEL || 'deepseek-chat'

const CHAIN_INITIAL_DELAY_MS = 2000
const CHAIN_RETRY_DELAY_STEP_MS = 2000
const CHAIN_MAX_RETRIES = 2

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** 链式触发下一轮 worker：先延迟 2s，失败最多重试 2 次（每次间隔递增 2s） */
async function chainNextWorker(batchId, roundNum, remainingChunks) {
  console.log(`[batchWorker] 第${roundNum}轮完成，剩余${remainingChunks}个分块`, { batchId })

  let delayMs = CHAIN_INITIAL_DELAY_MS
  let lastError = '链式 worker 触发失败'

  for (let attempt = 0; attempt <= CHAIN_MAX_RETRIES; attempt++) {
    console.log('[batchWorker] 链式触发下一轮', {
      batchId,
      roundNum,
      attempt: attempt + 1,
      maxAttempts: CHAIN_MAX_RETRIES + 1,
      delayMs,
    })
    await sleep(delayMs)
    delayMs += CHAIN_RETRY_DELAY_STEP_MS

    const result = await triggerBatchWorker(batchId)
    if (result.ok) {
      console.log('[batchWorker] 链式触发成功', {
        batchId,
        roundNum,
        attempt: attempt + 1,
        httpStatus: result.status,
      })
      return
    }

    lastError = result.error || lastError
    console.error('[batchWorker] 链式触发失败', {
      batchId,
      roundNum,
      attempt: attempt + 1,
      httpStatus: result.status,
      error: lastError,
    })
  }

  const errMsg = `链式 worker 触发失败（batchId=${batchId}，已重试 ${CHAIN_MAX_RETRIES} 次）：${lastError}`
  console.error('[batchWorker] 链式触发全部失败，标记任务 failed', { batchId, errMsg })
  await markBatchFailed(batchId, errMsg)
}

async function processOneItem(item, meta, sortOffset) {
  console.log('[batchWorker] 开始处理分块', {
    itemId: item.id,
    itemIndex: item.item_index,
    chunkLength: item.chunk_text?.length ?? 0,
  })
  await markItemProcessing(item.id)
  try {
    const prompt = buildBatchSplitPrompt(item.chunk_text, meta)
    console.log('[batchWorker] 调用 AI 拆题', { itemId: item.id, model: BATCH_MODEL })
    const content = await callDeepSeekAI(BATCH_SYSTEM_PROMPT, prompt, {
      model: BATCH_MODEL,
      maxTokens: 4096,
      label: 'batch-split',
    })
    const raw = safeJsonParse(extractJson(content))
    const questions = normalizeBatchQuestions(raw, meta, sortOffset)
    console.log('[batchWorker] AI 拆题完成', { itemId: item.id, questionCount: questions.length })
    await markItemCompleted(item.id, questions)
    return { success: true, questions, itemId: item.id }
  } catch (error) {
    const msg = error instanceof Error ? error.message : '拆题失败'
    console.error('[batchWorker] 分块处理失败', { itemId: item.id, msg })
    await markItemFailed(item.id, msg)
    return { success: false, error: msg, itemId: item.id }
  }
}

async function runPool(items, meta, startSort) {
  let sort = startSort
  const results = []
  for (let i = 0; i < items.length; i += CONCURRENCY) {
    const slice = items.slice(i, i + CONCURRENCY)
    console.log('[batchWorker] 并发批次', { batchFrom: i, batchSize: slice.length })
    const settled = await Promise.all(slice.map((item) => processOneItem(item, meta, sort)))
    for (const r of settled) {
      results.push(r)
      if (r.success && r.questions) sort += r.questions.length
    }
  }
  return results
}

/**
 * 核心 Worker：每轮处理 ITEMS_PER_INVOCATION 个 pending 分块，并发 AI 拆题并入库
 * 若仍有 pending，链式触发下一轮 worker（突破 60s 限制，支持 100～1000 题）
 */
export async function runBatchWorker(batchId) {
  console.log('[batchWorker] === 开始 runBatchWorker ===', { batchId })

  const task = await getBatchTask(batchId)
  if (!task) throw new Error('批量任务不存在')

  console.log('[batchWorker] 任务快照', {
    batchId,
    status: task.status,
    totalItems: task.total_items,
    teacherId: task.teacher_id,
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
    const finalStatus = counts.failed > 0 && counts.completed === 0 ? 'failed' : counts.failed > 0 ? 'partial' : 'completed'
    console.log('[batchWorker] 无待处理分块，收尾', { batchId, finalStatus, counts })
    await updateBatchProgress(batchId, {
      completedItems: counts.completed + counts.failed,
      status: finalStatus,
    })
    if (finalStatus === 'completed' || finalStatus === 'partial') {
      await markBatchCompleted(batchId)
    }
    return { done: true, status: finalStatus, counts }
  }

  const startSort = task.total_questions ?? 0
  const results = await runPool(pending, meta, startSort)

  for (const r of results) {
    if (r.success && r.questions?.length) {
      console.log('[batchWorker] 入库题目', { batchId, itemId: r.itemId, count: r.questions.length })
      await insertBatchQuestions(batchId, task.teacher_id, r.itemId, r.questions)
    }
  }

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
    await chainNextWorker(batchId, roundNum, remainingChunks)
    return { continued: true, processed: pending.length, counts, roundNum, remainingChunks }
  }

  const finalStatus = counts.failed > 0 ? 'partial' : 'completed'
  console.log('[batchWorker] 全部完成', { batchId, finalStatus, counts })
  await updateBatchProgress(batchId, { status: finalStatus })
  if (finalStatus === 'completed' || finalStatus === 'partial') {
    await markBatchCompleted(batchId)
  }
  return { done: true, status: finalStatus, counts }
}

export async function safeRunBatchWorker(batchId) {
  try {
    const result = await runBatchWorker(batchId)
    console.log('[batchWorker] === runBatchWorker 结束 ===', { batchId, result })
    return result
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Worker 异常'
    console.error('[batchWorker] === runBatchWorker 异常 ===', { batchId, msg, stack: error instanceof Error ? error.stack : undefined })
    try {
      await markBatchFailed(batchId, msg)
    } catch (markErr) {
      console.error('[batchWorker] 标记 failed 也失败', { batchId, markErr })
    }
    return { success: false, message: msg }
  }
}
