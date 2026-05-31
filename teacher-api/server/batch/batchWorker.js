import { callDeepSeekAI, extractJson } from '../deepseekClient.js'
import { safeJsonParse } from './safeJson.js'
import { BATCH_SYSTEM_PROMPT, buildBatchSplitPrompt, parseBatchSplitAiResponse } from './batchPrompt.js'
import { normalizeQuestionsBatch } from './questionNormalizer.js'
import {
  countItemsByStatus,
  fetchPendingItems,
  finalizeBatchTaskFromDatabase,
  getBatchTask,
  insertBatchQuestions,
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
const AI_PARSE_RETRY_COUNT = 2
const AI_PARSE_RETRY_DELAY_MS = 2000

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** 完全基于 batch_question_bank 真实 COUNT 判断任务最终状态 */
async function resolveFinalBatchStatus(batchId, counts) {
  if (counts.pending > 0 || counts.processing > 0) {
    return null
  }

  try {
    const { realCount, status } = await finalizeBatchTaskFromDatabase(batchId, counts)
    return status
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[batchWorker] finalizeBatchTaskFromDatabase 失败', { batchId, msg })
    await markBatchFailed(batchId, msg)
    return 'failed'
  }
}

/** 链式触发下一轮 worker */
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
      console.log('[batchWorker] 链式触发成功', { batchId, roundNum, attempt: attempt + 1 })
      return
    }

    lastError = result.error || lastError
    console.error('[batchWorker] 链式触发失败', { batchId, roundNum, attempt: attempt + 1, error: lastError })
  }

  const errMsg = `链式 worker 触发失败（batchId=${batchId}，已重试 ${CHAIN_MAX_RETRIES} 次）：${lastError}`
  console.error('[batchWorker] 链式触发全部失败，标记任务 failed', { batchId, errMsg })
  await markBatchFailed(batchId, errMsg)
}

/**
 * 调用 AI 并解析题目（失败自动重试 2 次，间隔 2 秒；仍失败则宽松 JSON 提取）
 */
async function callAiParseWithRetry(item, meta, sortOffset) {
  const prompt = buildBatchSplitPrompt(item.chunk_text, meta)
  let lastResult = null
  let lastError = null

  for (let attempt = 0; attempt <= AI_PARSE_RETRY_COUNT; attempt++) {
    if (attempt > 0) {
      console.log('[batchWorker] AI 解析重试', {
        itemId: item.id,
        attempt,
        delayMs: AI_PARSE_RETRY_DELAY_MS,
      })
      await sleep(AI_PARSE_RETRY_DELAY_MS)
    }

    try {
      console.log('[batchWorker] 调用 AI 拆题', { itemId: item.id, model: BATCH_MODEL, attempt })
      const content = await callDeepSeekAI(BATCH_SYSTEM_PROMPT, prompt, {
        model: BATCH_MODEL,
        maxTokens: 4096,
        label: 'batch-split',
      })

      console.log('[batchWorker] AI 完整原始响应前1000字符:', String(content ?? '').slice(0, 1000))

      const parsed = parseBatchSplitAiResponse(
        content,
        meta,
        sortOffset,
        extractJson,
        safeJsonParse,
      )

      console.log('[batchWorker] AI 解析结果', {
        itemId: item.id,
        attempt,
        extractPath: parsed.extractPath,
        rawQuestionsCount: parsed.rawQuestions?.length ?? 0,
        questionCount: parsed.questions?.length ?? 0,
      })

      lastResult = { ...parsed, aiContent: content }

      if (parsed.questions?.length > 0) {
        return lastResult
      }

      lastError = new Error(`AI 解析题目为空（extractPath=${parsed.extractPath}）`)
      console.warn('[batchWorker] 本轮解析无题目，准备重试', { itemId: item.id, attempt })
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      console.error('[batchWorker] AI 调用/解析异常', {
        itemId: item.id,
        attempt,
        message: lastError.message,
        stack: lastError.stack,
      })
    }
  }

  if (lastResult?.questions?.length) return lastResult
  throw lastError ?? new Error('AI 解析失败（已重试 2 次）')
}

async function processOneItem(item, meta, sortOffset, batchId) {
  console.log('[batchWorker] 开始处理分块', {
    itemId: item.id,
    itemIndex: item.item_index,
    chunkLength: item.chunk_text?.length ?? 0,
  })
  await markItemProcessing(item.id)

  try {
    const parsed = await callAiParseWithRetry(item, meta, sortOffset)
    const rawQuestions = parsed.questions ?? []

    console.log('[Worker] 提取题目，原始数据字段=questions', {
      itemId: item.id,
      rawCount: rawQuestions.length,
      extractPath: parsed.extractPath,
    })

    const { valid: normalizedQuestions, rawCount, filteredCount } = normalizeQuestionsBatch(
      rawQuestions,
      meta,
      sortOffset,
    )

    console.log('[Worker] 提取题目，原始数据字段=normalized', {
      itemId: item.id,
      validCount: normalizedQuestions.length,
      filteredCount,
    })

    if (!normalizedQuestions.length) {
      const msg = `标准化后无有效题目（原始=${rawCount}，过滤=${filteredCount}，extractPath=${parsed.extractPath}）`
      console.error('[Worker] 严重错误：rawQuestions 为空！', {
        itemId: item.id,
        batchId,
        rawCount,
        filteredCount,
      })
      await markItemFailed(item.id, msg)
      if (batchId) await markBatchFailed(batchId, msg)
      return { success: false, error: msg, itemId: item.id, rawQuestions: [], questions: [] }
    }

    return {
      success: true,
      rawQuestions: normalizedQuestions,
      questions: normalizedQuestions,
      itemId: item.id,
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : '拆题失败'
    console.error('[batchWorker] 分块处理失败', { itemId: item.id, msg, stack: error instanceof Error ? error.stack : undefined })
    await markItemFailed(item.id, msg)
    return { success: false, error: msg, itemId: item.id, rawQuestions: [], questions: [] }
  }
}

async function persistItemQuestions(batchId, teacherId, itemId, rawQuestions, taskMeta) {
  const count = Array.isArray(rawQuestions) ? rawQuestions.length : 0
  console.log('[Worker] 准备入库，题目数量=' + count, { batchId, itemId, teacherId })

  if (!count) {
    const msg = 'rawQuestions 为空，无法入库'
    console.error('[Worker] 严重错误：rawQuestions 为空！', { batchId, itemId })
    await markItemFailed(itemId, msg)
    await markBatchFailed(batchId, msg)
    throw new Error(msg)
  }

  console.log('[Worker] 准备入库，第一条题目摘要=', JSON.stringify({
    content: String(rawQuestions[0]?.content ?? '').slice(0, 80),
    question_type: rawQuestions[0]?.question_type,
    optionsCount: rawQuestions[0]?.options?.length ?? 0,
  }))

  const insertResult = await insertBatchQuestions(batchId, teacherId, itemId, rawQuestions, taskMeta)
  if (!insertResult?.success || !insertResult.count) {
    const msg = insertResult?.error || '入库失败或未写入任何题目'
    console.error('[batchWorker] 入库失败，终止任务', { batchId, itemId, msg })
    await markItemFailed(itemId, msg)
    throw new Error(msg)
  }

  await markItemCompleted(itemId, rawQuestions)
  return insertResult.count
}

async function runPool(items, meta, startSort, batchId, teacherId, taskMeta) {
  let sort = startSort
  const results = []
  for (let i = 0; i < items.length; i += CONCURRENCY) {
    const slice = items.slice(i, i + CONCURRENCY)
    console.log('[batchWorker] 并发批次', { batchFrom: i, batchSize: slice.length })
    const settled = await Promise.all(slice.map((item) => processOneItem(item, meta, sort, batchId)))
    for (const r of settled) {
      results.push(r)
      if (r.success && r.rawQuestions?.length) {
        const written = await persistItemQuestions(batchId, teacherId, r.itemId, r.rawQuestions, taskMeta)
        sort += written
      }
    }
  }
  return results
}

/**
 * 核心 Worker：每轮处理 ITEMS_PER_INVOCATION 个 pending 分块，并发 AI 拆题并入库
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

  const startSort = task.total_questions ?? 0
  await runPool(pending, meta, startSort, batchId, task.teacher_id, meta)

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

  const finalStatus = await resolveFinalBatchStatus(batchId, counts)
  console.log('[batchWorker] 全部完成', { batchId, finalStatus, counts })
  return { done: true, status: finalStatus ?? 'failed', counts }
}

export async function safeRunBatchWorker(batchId) {
  try {
    const result = await runBatchWorker(batchId)
    console.log('[batchWorker] === runBatchWorker 结束 ===', { batchId, result })
    return result
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Worker 异常'
    console.error('[batchWorker] === runBatchWorker 异常 ===', {
      batchId,
      msg,
      stack: error instanceof Error ? error.stack : undefined,
    })
    try {
      await markBatchFailed(batchId, msg)
    } catch (markErr) {
      console.error('[batchWorker] 标记 failed 也失败', { batchId, markErr })
    }
    return { success: false, message: msg, status: 'failed' }
  }
}
