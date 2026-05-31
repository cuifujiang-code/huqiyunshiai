import { waitUntil } from '@vercel/functions'
import { callDeepSeekAI, extractJson } from '../deepseekClient.js'
import { safeJsonParse } from './safeJson.js'
import {
  BATCH_SYSTEM_PROMPT,
  buildBatchSplitPrompt,
  buildBatchSplitFallbackPrompt,
  parseBatchSplitAiResponse,
} from './batchPrompt.js'
import { normalizeQuestionsBatch } from './questionNormalizer.js'
import {
  countItemsByStatus,
  emergencyRecover,
  fetchPendingItems,
  finalizeBatchTaskFromDatabase,
  getBatchTask,
  insertBatchQuestions,
  markBatchFailed,
  markBatchRunning,
  markItemCompleted,
  markItemFailed,
  markItemProcessing,
  recoverTaskStatusFromBankCount,
  resetStuckProcessingItems,
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
      questionCount: result?.rawQuestions?.length ?? 0,
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

async function invokeAiParse(item, meta, sortOffset, useFallbackPrompt) {
  const prompt = useFallbackPrompt
    ? buildBatchSplitFallbackPrompt(item.chunk_text, meta)
    : buildBatchSplitPrompt(item.chunk_text, meta)

  const content = await callDeepSeekAI(BATCH_SYSTEM_PROMPT, prompt, {
    model: BATCH_MODEL,
    maxTokens: 4096,
    label: useFallbackPrompt ? 'batch-split-fallback' : 'batch-split',
  })

  console.log('[batchWorker] AI 完整原始响应前1000字符:', String(content ?? '').slice(0, 1000))

  return await parseBatchSplitAiResponse(content, meta, sortOffset, extractJson, safeJsonParse)
}

/**
 * 调用 AI 并解析题目（失败自动重试；仍为空则用备用 prompt 再试一次）
 */
async function callAiParseWithRetry(item, meta, sortOffset) {
  let lastResult = null
  let lastError = null

  for (let attempt = 0; attempt <= AI_PARSE_RETRY_COUNT; attempt++) {
    if (attempt > 0) {
      console.log('[batchWorker] AI 解析重试', { itemId: item.id, attempt, delayMs: AI_PARSE_RETRY_DELAY_MS })
      await sleep(AI_PARSE_RETRY_DELAY_MS)
    }

    try {
      console.log('[batchWorker] 调用 AI 拆题', { itemId: item.id, model: BATCH_MODEL, attempt })
      const parsed = await invokeAiParse(item, meta, sortOffset, false)

      console.log('[batchWorker] AI 解析结果', {
        itemId: item.id,
        attempt,
        extractPath: parsed.extractPath,
        rawQuestionsCount: parsed.rawQuestions?.length ?? 0,
        questionCount: parsed.questions?.length ?? 0,
      })

      lastResult = parsed
      if (parsed.questions?.length > 0) return parsed

      lastError = new Error(`AI 解析题目为空（extractPath=${parsed.extractPath}）`)
      console.warn('[batchWorker] 本轮解析无题目，准备重试', { itemId: item.id, attempt })
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      console.error('[batchWorker] AI 调用/解析异常', {
        itemId: item.id,
        attempt,
        message: lastError.message,
      })
    }
  }

  if (lastResult?.questions?.length) return lastResult

  console.warn('[batchPrompt] 主 prompt 解析为空，启用备用 prompt 重试', { itemId: item.id })
  try {
    await sleep(AI_PARSE_RETRY_DELAY_MS)
    const fallbackParsed = await invokeAiParse(item, meta, sortOffset, true)
    console.log('[batchWorker] 备用 prompt 解析结果', {
      itemId: item.id,
      extractPath: fallbackParsed.extractPath,
      questionCount: fallbackParsed.questions?.length ?? 0,
    })
    if (fallbackParsed.questions?.length > 0) return fallbackParsed
    lastResult = fallbackParsed
    lastError = new Error(`备用 prompt 仍为空（extractPath=${fallbackParsed.extractPath}）`)
  } catch (err) {
    lastError = err instanceof Error ? err : new Error(String(err))
    console.error('[batchWorker] 备用 prompt 解析异常', { itemId: item.id, message: lastError.message })
  }

  console.error('[batchWorker] AI 解析最终为空，不标记任务失败，等待数据库兜底', {
    itemId: item.id,
    message: lastError?.message,
  })
  return lastResult ?? { questions: [], rawQuestions: [], extractPath: 'empty_after_fallback', parsed: null }
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
      const msg = `本分块无有效题目（原始=${rawCount}，过滤=${filteredCount}，extractPath=${parsed.extractPath}）`
      console.warn('[Worker] 本分块跳过入库，不标记任务失败，等待最终数据库兜底', {
        itemId: item.id,
        batchId,
        msg,
      })
      await markItemFailed(item.id, msg)
      return { success: false, error: msg, itemId: item.id, rawQuestions: [], questions: [], skipTaskFail: true }
    }

    return {
      success: true,
      rawQuestions: normalizedQuestions,
      questions: normalizedQuestions,
      itemId: item.id,
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : '拆题失败'
    console.error('[batchWorker] 分块处理失败', { itemId: item.id, msg })
    await markItemFailed(item.id, msg)
    return { success: false, error: msg, itemId: item.id, rawQuestions: [], questions: [], skipTaskFail: true }
  }
}

async function persistItemQuestions(batchId, teacherId, itemId, rawQuestions, taskMeta) {
  const count = Array.isArray(rawQuestions) ? rawQuestions.length : 0
  console.log('[Worker] 准备入库，题目数量=' + count, { batchId, itemId, teacherId })

  const insertResult = await insertBatchQuestions(batchId, teacherId, itemId, rawQuestions, taskMeta)

  if (insertResult?.skipped) {
    console.warn('[Worker] 入库跳过（空数组）', { batchId, itemId })
    return 0
  }

  if (!insertResult?.success) {
    const msg = insertResult?.error || '入库失败'
    console.error('[batchWorker] 入库失败', { batchId, itemId, msg })
    await markItemFailed(itemId, msg)
    throw new Error(msg)
  }

  if (insertResult.count > 0) {
    await markItemCompleted(itemId, rawQuestions)
  }

  return insertResult.count ?? 0
}

async function runPool(items, meta, startSort, batchId, teacherId, taskMeta) {
  let sort = startSort
  const results = []
  for (let i = 0; i < items.length; i += CONCURRENCY) {
    const slice = items.slice(i, i + CONCURRENCY)
    console.log('[batchWorker] 并发批次', {
      batchFrom: i,
      batchSize: slice.length,
      itemIndexes: slice.map((it) => it.item_index),
    })
    const settled = await Promise.all(slice.map((item) => processOneItem(item, meta, sort, batchId)))
    for (const r of settled) {
      results.push(r)
      if (r.success && r.rawQuestions?.length) {
        const written = await persistItemQuestions(batchId, teacherId, r.itemId, r.rawQuestions, taskMeta)
        sort += written
      }
    }
    console.log('[batchWorker] 并发批次完成', {
      batchId,
      batchFrom: i,
      outcomes: settled.map((r, j) => ({
        itemIndex: slice[j]?.item_index,
        itemId: r.itemId,
        success: r.success,
        error: r.error ?? null,
      })),
    })
  }
  return results
}

/**
 * 核心 Worker：每轮处理 ITEMS_PER_INVOCATION 个 pending 分块，并发 AI 拆题并入库
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

  const startSort = task.total_questions ?? 0
  const roundResults = await runPool(pending, meta, startSort, batchId, task.teacher_id, meta)

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
      await safeMarkBatchFailed(batchId, msg, result?.counts ?? {})
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
