import { waitUntil } from '@vercel/functions'
import { callDeepSeekAI, DeepSeekApiError, extractJson, serializeError } from '../deepseekClient.js'
import { safeJsonParse } from './safeJson.js'
import {
  BATCH_SYSTEM_PROMPT,
  backupPrompt,
  buildBatchSplitPrompt,
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
  syncImportedQuestionsFromBank,
  updateBatchProgress,
} from './batchTaskStore.js'
import { triggerBatchWorker } from './batchTrigger.js'

const CONCURRENCY = Number(process.env.BATCH_AI_CONCURRENCY || 2)
const ITEMS_PER_INVOCATION = Number(process.env.BATCH_ITEMS_PER_RUN || 3)
const BATCH_MODEL = process.env.DEEPSEEK_BATCH_MODEL || process.env.DEEPSEEK_MODEL || 'deepseek-chat'

const CHAIN_INITIAL_DELAY_MS = 2000
const CHAIN_RETRY_DELAY_STEP_MS = 2000
const CHAIN_MAX_RETRIES = 2
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

const AI_PARSE_FAIL_MESSAGE = 'AI 解析未返回有效题目'

async function invokeAiParse(item, meta, sortOffset, useBackupPrompt) {
  const prompt = useBackupPrompt
    ? backupPrompt(item.chunk_text, meta)
    : buildBatchSplitPrompt(item.chunk_text, meta)

  let aiResponse
  try {
    aiResponse = await callDeepSeekAI(BATCH_SYSTEM_PROMPT, prompt, {
      model: BATCH_MODEL,
      maxTokens: 4096,
      label: useBackupPrompt ? 'batch-split-backup' : 'batch-split',
    })
  } catch (err) {
    const detail = serializeError(err)
    console.error('[batchWorker] DeepSeek API 调用失败', {
      itemId: item.id,
      itemIndex: item.item_index,
      useBackupPrompt,
      model: BATCH_MODEL,
      detail,
    })
    throw err
  }

  if (!aiResponse || !String(aiResponse).trim()) {
    const msg = 'DeepSeek API 返回空内容'
    console.warn('[batchWorker] DeepSeek 空内容（客户端重试后仍失败）', {
      itemId: item.id,
      itemIndex: item.item_index,
    })
    throw new DeepSeekApiError(msg, { model: BATCH_MODEL })
  }

  console.log('[DeepSeek] 完整响应:', JSON.stringify(aiResponse, null, 2))
  console.log('[AI解析] 原始返回数据: ' + JSON.stringify(aiResponse))

  const parsed = await parseBatchSplitAiResponse(aiResponse, meta, sortOffset, extractJson, safeJsonParse)
  return { ...parsed, aiResponse }
}

/**
 * 调用 AI 并解析题目：主 prompt 一次 + backupPrompt 重试一次；仍为空则 markBatchFailed
 */
async function callAiParseWithRetry(item, meta, sortOffset, batchId) {
  let lastResult = null

  for (const [attemptIndex, useBackup] of [[0, false], [1, true]]) {
    if (attemptIndex > 0) {
      console.warn('[batchWorker] 主 prompt 无有效题目，启用 backupPrompt 重试', {
        batchId,
        itemId: item.id,
        itemIndex: item.item_index,
        delayMs: AI_PARSE_RETRY_DELAY_MS,
      })
      await sleep(AI_PARSE_RETRY_DELAY_MS)
    }

    try {
      console.log('[batchWorker] 调用 AI 拆题', {
        batchId,
        itemId: item.id,
        itemIndex: item.item_index,
        model: BATCH_MODEL,
        attempt: attemptIndex,
        prompt: useBackup ? 'backupPrompt' : 'primary',
      })

      const parsed = await invokeAiParse(item, meta, sortOffset, useBackup)
      lastResult = parsed

      console.log('[batchWorker] AI 解析结果', {
        batchId,
        itemId: item.id,
        attempt: attemptIndex,
        extractPath: parsed.extractPath,
        rawQuestionsCount: parsed.rawQuestions?.length ?? 0,
        questionCount: parsed.questions?.length ?? 0,
        parsedKeys: parsed.parsed && typeof parsed.parsed === 'object' && !Array.isArray(parsed.parsed)
          ? Object.keys(parsed.parsed)
          : Array.isArray(parsed.parsed) ? [`array(${parsed.parsed.length})`] : [],
      })

      if (parsed.questions?.length > 0) return parsed
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      const detail = serializeError(err)
      console.error('[batchWorker] AI 调用/解析异常', {
        batchId,
        itemId: item.id,
        itemIndex: item.item_index,
        attempt: attemptIndex,
        message: msg,
        detail,
      })
      if (err instanceof DeepSeekApiError || attemptIndex === 1) {
        throw err
      }
    }
  }

  const detail = {
    batchId,
    itemId: item.id,
    itemIndex: item.item_index,
    extractPath: lastResult?.extractPath,
    attempts: lastResult?.attempts,
    aiResponsePreview: String(lastResult?.aiResponse ?? '').slice(0, 1000),
    parsedPreview: lastResult?.parsed ? JSON.stringify(lastResult.parsed).slice(0, 500) : null,
  }
  console.error('[batchWorker] AI 解析两次均为空，标记任务失败', detail)
  await markBatchFailed(batchId, AI_PARSE_FAIL_MESSAGE)
  throw new Error(AI_PARSE_FAIL_MESSAGE)
}

async function processOneItem(item, meta, sortOffset, batchId) {
  console.log('[batchWorker] 开始处理分块', {
    itemId: item.id,
    itemIndex: item.item_index,
    chunkLength: item.chunk_text?.length ?? 0,
  })
  await markItemProcessing(item.id)

  try {
    const parsed = await callAiParseWithRetry(item, meta, sortOffset, batchId)
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
      // 详细诊断：序列化完整 AI 返回数据
      const parsedSummary = {
        extractPath: parsed.extractPath,
        rawCount,
        filteredCount,
        attempts: parsed.attempts || '(无)',
        firstRawQuestion: rawQuestions[0] ? JSON.stringify(rawQuestions[0]).slice(0, 500) : '(空)',
        allRawKeys: rawQuestions.length > 0 ? Object.keys(rawQuestions[0] || {}).join(',') : '(空)',
        parsedKeys: parsed.parsed ? (Array.isArray(parsed.parsed) ? `Array[${parsed.parsed.length}]` : Object.keys(parsed.parsed).join(',')) : '(空)',
        parsedPreview: parsed.parsed ? JSON.stringify(parsed.parsed).slice(0, 800) : '(空)',
      }
      const rawPreview = parsed.rawPreview1000 || (parsed.parsed ? JSON.stringify(parsed.parsed).slice(0, 500) : '无')
      const detailMsg = [
        `本分块无有效题目`,
        `原始=${rawCount}，过滤=${filteredCount}`,
        `extractPath=${parsed.extractPath}`,
        `attempts=${JSON.stringify(parsed.attempts || [])}`,
        `parsedSummary=${JSON.stringify(parsedSummary)}`,
        `AI响应预览: ${rawPreview.slice(0, 500)}`,
      ].join(' | ')
      console.error('[Worker] 本分块题目归一化后为空', { itemId: item.id, batchId, detailMsg })
      await markItemFailed(item.id, detailMsg)
      await markBatchFailed(batchId, AI_PARSE_FAIL_MESSAGE)
      return { success: false, error: detailMsg, itemId: item.id, rawQuestions: [], questions: [], failTask: true }
    }

    return {
      success: true,
      rawQuestions: normalizedQuestions,
      questions: normalizedQuestions,
      itemId: item.id,
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : '拆题失败'
    const detail = serializeError(error)
    const detailMsg = error instanceof DeepSeekApiError
      ? `DeepSeek API 失败: ${msg}${error.statusCode ? ` (HTTP ${error.statusCode})` : ''}`
      : msg
    console.error('[batchWorker] 分块处理失败', {
      itemId: item.id,
      itemIndex: item.item_index,
      batchId,
      msg: detailMsg,
      detail,
    })
    await markItemFailed(item.id, detailMsg)
    if (msg === AI_PARSE_FAIL_MESSAGE) {
      return { success: false, error: detailMsg, itemId: item.id, rawQuestions: [], questions: [], failTask: true }
    }
    return { success: false, error: detailMsg, itemId: item.id, rawQuestions: [], questions: [], skipTaskFail: true }
  }
}

async function persistItemQuestions(batchId, teacherId, itemId, rawQuestions, taskMeta) {
  const count = Array.isArray(rawQuestions) ? rawQuestions.length : 0
  console.log('[Worker] 准备入库，题目数量=' + count, { batchId, itemId, teacherId })

  const insertResult = await insertBatchQuestions(
    batchId,
    teacherId,
    itemId,
    rawQuestions,
    taskMeta,
    { syncTaskCounts: false, syncTeacherBank: false },
  )

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
  const results = []

  // Phase 1: 并发 AI（不穿插入库，控制单轮耗时）
  for (let i = 0; i < items.length; i += CONCURRENCY) {
    const slice = items.slice(i, i + CONCURRENCY)
    console.log('[batchWorker] 并发批次 AI 调用', {
      batchFrom: i,
      batchSize: slice.length,
      itemIndexes: slice.map((it) => it.item_index),
    })
    const settled = await Promise.all(slice.map((item) => processOneItem(item, meta, startSort, batchId)))
    results.push(...settled)
    console.log('[batchWorker] 并发批次 AI 调用完成', {
      batchId,
      batchFrom: i,
      outcomes: settled.map((r, j) => ({
        itemIndex: slice[j]?.item_index,
        itemId: r.itemId,
        success: r.success,
        error: r.error ?? null,
      })),
    })
    if (settled.some((r) => r.failTask)) break
  }

  if (results.some((r) => r.failTask)) return results

  // Phase 2: 本轮全部 AI 完成后统一入库（每轮仅一次 COUNT 同步）
  const successItems = results.filter((r) => r.success && r.rawQuestions?.length)
  if (successItems.length) {
    console.log('[batchWorker] 本轮统一入库', {
      batchId,
      itemCount: successItems.length,
      totalQuestions: successItems.reduce((n, r) => n + r.rawQuestions.length, 0),
    })
    for (const item of successItems) {
      await persistItemQuestions(batchId, teacherId, item.itemId, item.rawQuestions, taskMeta)
    }
    await syncImportedQuestionsFromBank(batchId)
    console.log('[batchWorker] 本轮入库完成，已同步任务题目数', { batchId })
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

  if (roundResults.some((r) => r.failTask)) {
    const counts = await countItemsByStatus(batchId)
    console.error('[batchWorker] AI 解析失败，终止后续分块处理', { batchId, counts })
    return { done: true, status: 'failed', counts, message: AI_PARSE_FAIL_MESSAGE }
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
