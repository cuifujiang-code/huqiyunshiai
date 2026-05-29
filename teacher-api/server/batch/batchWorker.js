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
import { chainBatchWorker } from './batchTrigger.js'

const CONCURRENCY = Number(process.env.BATCH_AI_CONCURRENCY || 5)
const ITEMS_PER_INVOCATION = Number(process.env.BATCH_ITEMS_PER_RUN || 8)
const BATCH_MODEL = process.env.DEEPSEEK_BATCH_MODEL || process.env.DEEPSEEK_MODEL || 'deepseek-chat'

async function processOneItem(item, meta, sortOffset) {
  await markItemProcessing(item.id)
  try {
    const prompt = buildBatchSplitPrompt(item.chunk_text, meta)
    const content = await callDeepSeekAI(BATCH_SYSTEM_PROMPT, prompt, {
      model: BATCH_MODEL,
      maxTokens: 4096,
      label: 'batch-split',
    })
    const raw = safeJsonParse(extractJson(content))
    const questions = normalizeBatchQuestions(raw, meta, sortOffset)
    await markItemCompleted(item.id, questions)
    return { success: true, questions, itemId: item.id }
  } catch (error) {
    const msg = error instanceof Error ? error.message : '拆题失败'
    await markItemFailed(item.id, msg)
    return { success: false, error: msg, itemId: item.id }
  }
}

async function runPool(items, meta, startSort) {
  let sort = startSort
  const results = []
  for (let i = 0; i < items.length; i += CONCURRENCY) {
    const slice = items.slice(i, i + CONCURRENCY)
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
  const task = await getBatchTask(batchId)
  if (!task) throw new Error('批量任务不存在')

  if (task.status === 'completed') {
    return { skipped: true, status: 'completed' }
  }

  const meta = { subject: task.subject, grade: task.grade }

  if (task.status === 'pending') {
    await markBatchRunning(batchId)
  }

  const pending = await fetchPendingItems(batchId, ITEMS_PER_INVOCATION)
  if (!pending.length) {
    const counts = await countItemsByStatus(batchId)
    const finalStatus = counts.failed > 0 && counts.completed === 0 ? 'failed' : counts.failed > 0 ? 'partial' : 'completed'
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
      await insertBatchQuestions(batchId, task.teacher_id, r.itemId, r.questions)
    }
  }

  const counts = await countItemsByStatus(batchId)
  await updateBatchProgress(batchId, {
    completedItems: counts.completed + counts.failed,
    status: 'running',
  })

  if (counts.pending > 0 || counts.processing > 0) {
    chainBatchWorker(batchId)
    return { continued: true, processed: pending.length, counts }
  }

  const finalStatus = counts.failed > 0 ? 'partial' : 'completed'
  await updateBatchProgress(batchId, { status: finalStatus })
  if (finalStatus === 'completed' || finalStatus === 'partial') {
    await markBatchCompleted(batchId)
  }
  return { done: true, status: finalStatus, counts }
}

export async function safeRunBatchWorker(batchId) {
  try {
    return await runBatchWorker(batchId)
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Worker 异常'
    console.error('[batchWorker] 失败', { batchId, msg })
    await markBatchFailed(batchId, msg)
    return { success: false, message: msg }
  }
}
