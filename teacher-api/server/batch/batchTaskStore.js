import {
  createServiceRoleClient,
  getServiceRoleKey,
  getSupabaseUrl,
  getSupabaseAdmin,
  isSupabaseAdminConfigured,
} from '../supabaseAdmin.js'

const TASKS = 'batch_decompose_tasks'
const ITEMS = 'batch_decompose_items'
const BANK = 'batch_question_bank'

export { isSupabaseAdminConfigured as isBatchStoreConfigured }

function nowIso() {
  return new Date().toISOString()
}

function staleCutoffIso(staleMinutes) {
  return new Date(Date.now() - staleMinutes * 60 * 1000).toISOString()
}

function formatSupabaseError(error) {
  const parts = [error.message || '未知数据库错误']
  if (error.code) parts.push(`code=${error.code}`)
  if (error.details) parts.push(`details=${error.details}`)
  if (error.hint) parts.push(`hint=${error.hint}`)
  return parts.join('; ')
}

function maskEnvValue(value, prefixLen = 10) {
  if (!value) return '(missing)'
  return `${String(value).slice(0, prefixLen)}…(len=${String(value).length})`
}

function logSupabaseInsertEnv(batchId) {
  const url = getSupabaseUrl()
  const key = getServiceRoleKey()
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''
  console.log('[入库] Supabase 环境变量检查', {
    batchId,
    supabaseUrlPrefix: url ? url.slice(0, 20) : '(missing)',
    serviceRoleKeyPrefix: maskEnvValue(key, 10),
    hasSupabaseUrl: Boolean(process.env.SUPABASE_URL),
    hasViteSupabaseUrl: Boolean(process.env.VITE_SUPABASE_URL),
    hasServiceRoleKey: Boolean(key),
    usingServiceRoleKeyOnly: true,
    anonKeyMatchesServiceKey: Boolean(anonKey && key && anonKey === key),
  })
}

/** batch_question_bank 读写专用：统一走 createServiceRoleClient（SUPABASE_SERVICE_ROLE_KEY） */
function getBatchQuestionBankClient() {
  return createServiceRoleClient()
}

function normalizeBankInsertRow(q, batchId, teacherId, itemId, fallbackIndex, taskMeta = {}) {
  const sortOrder = Number.isFinite(Number(q?.sort_order))
    ? Math.max(1, Number(q.sort_order))
    : fallbackIndex + 1
  const rawContent = String(q?.content ?? q?.question ?? q?.title ?? '').trim()
  const questionNumber = String(q?.question_number ?? q?.questionNumber ?? q?.number ?? '').trim() || String(sortOrder)

  const VALID_TYPES = new Set([
    '选择题', '填空题', '计算题', '证明题', '实验题', '应用题', '解答题',
    '作图题', '识图题', '推断题',
    '阅读理解', '文言文阅读', '古诗词鉴赏', '语言运用', '默写', '作文',
    '完形填空', '七选五', '语法填空', '短文改错', '书面表达', '听力',
    '材料分析题', '论述题', '综合题', '读图题',
  ])
  const VALID_DIFFICULTY = new Set(['基础', '中等', '拔高'])

  let questionType = String(q?.question_type ?? q?.type ?? '').trim() || '应用题'
  if (!VALID_TYPES.has(questionType)) questionType = '应用题'

  let difficulty = String(q?.difficulty ?? '').trim() || '中等'
  if (!VALID_DIFFICULTY.has(difficulty)) difficulty = '中等'

  const optionsRaw = q?.options ?? q?.choices ?? []
  const options = Array.isArray(optionsRaw)
    ? optionsRaw.map((o) => String(o ?? '').trim()).filter(Boolean)
    : []

  const latexRaw = q?.latex_blocks ?? q?.latexBlocks ?? []
  const latexBlocks = Array.isArray(latexRaw)
    ? latexRaw.map((b) => String(b ?? '').trim()).filter(Boolean)
    : []

  const tagsRaw = q?.tags ?? []
  const tags = Array.isArray(tagsRaw)
    ? tagsRaw.map((t) => String(t ?? '').trim()).filter(Boolean)
    : []

  return {
    batch_id: batchId,
    teacher_id: teacherId,
    item_id: itemId ?? null,
    subject: String(q?.subject ?? taskMeta.subject ?? '').trim() || '数学',
    grade: String(q?.grade ?? taskMeta.grade ?? '').trim() || '八年级',
    knowledge_point: String(q?.knowledge_point ?? q?.knowledgePoint ?? '').trim() || '未分类',
    question_type: questionType,
    difficulty,
    content: rawContent || `题目 ${sortOrder}`,
    options,
    answer: String(q?.answer ?? q?.correct_answer ?? '').trim() || '暂无',
    analysis: String(q?.analysis ?? q?.explanation ?? q?.解析 ?? '').trim() || '暂无',
    geometry_desc: String(q?.geometry_desc ?? q?.geometryDesc ?? '').trim() || '',
    latex_blocks: latexBlocks,
    source: String(q?.source ?? '').trim() || '批量拆题',
    tags,
    sort_order: sortOrder,
    question_number: questionNumber,
    visibility: 'personal',
  }
}

function summarizeBankRow(row) {
  return {
    sort_order: row.sort_order,
    question_number: row.question_number,
    question_type: row.question_type,
    difficulty: row.difficulty,
    contentPreview: String(row.content ?? '').slice(0, 120),
    optionsCount: Array.isArray(row.options) ? row.options.length : 0,
    answerPreview: String(row.answer ?? '').slice(0, 40),
  }
}

async function failBatchInsert(batchId, itemId, stage, detail) {
  const message = `${stage}: ${detail}`
  console.error(`[入库失败] ${message}`, { batchId, itemId })
  if (itemId) {
    try {
      await markItemFailed(itemId, message)
    } catch (e) {
      console.error('[入库失败] markItemFailed 异常', e)
    }
  }
  try {
    await markBatchFailed(batchId, message)
  } catch (e) {
    console.error('[入库失败] markBatchFailed 异常', e)
  }
  return { success: false, count: 0, error: message }
}

export async function createBatchTask({ batchId, teacherId, fileName, subject, grade, chunks, meta = {} }) {
  const admin = getSupabaseAdmin()
  const chunkCount = chunks.length

  console.log('[batchTaskStore] createBatchTask 开始', {
    batchId,
    teacherId,
    fileName,
    chunkCount,
    table: TASKS,
  })

  const { data: taskRow, error: taskErr } = await admin.from(TASKS).insert({
    batch_id: batchId,
    teacher_id: teacherId,
    file_name: fileName ?? '',
    subject: subject || '数学',
    grade: grade || '八年级',
    status: 'pending',
    total_items: chunkCount,
    completed_items: 0,
    total_questions: 0,
    imported_questions: 0,
    meta: meta ?? {},
    updated_at: nowIso(),
  }).select('id, batch_id, teacher_id, status, total_items').single()
  if (taskErr) {
    console.error('[batchTaskStore] createBatchTask 任务表写入失败', {
      batchId,
      teacherId,
      message: taskErr.message,
      code: taskErr.code,
      details: taskErr.details,
    })
    throw new Error(`batch_decompose_tasks 写入失败: ${formatSupabaseError(taskErr)}`)
  }
  if (!taskRow?.batch_id) {
    throw new Error('batch_decompose_tasks 写入后未返回 batch_id，请检查 Supabase 表结构与 RLS 策略')
  }

  const itemRows = chunks.map((text, index) => ({
    batch_id: batchId,
    item_index: index,
    status: 'pending',
    chunk_text: text,
    question_count: 0,
    result: {},
    updated_at: nowIso(),
  }))

  const { error: itemsErr } = await admin.from(ITEMS).insert(itemRows)
  if (itemsErr) {
    console.error('[batchTaskStore] createBatchTask 分块表写入失败', {
      batchId,
      itemCount: itemRows.length,
      message: itemsErr.message,
      code: itemsErr.code,
    })
    throw new Error(`batch_decompose_items 写入失败: ${formatSupabaseError(itemsErr)}`)
  }

  console.log('[batchTaskStore] createBatchTask 成功', {
    id: taskRow.id,
    batchId: taskRow.batch_id,
    teacherId,
    totalItems: chunkCount,
    itemsInserted: itemRows.length,
  })

  return {
    id: taskRow.id,
    batchId: taskRow.batch_id,
    totalItems: chunkCount,
    taskId: taskRow.batch_id,
  }
}

export async function getBatchTask(batchId) {
  const admin = getSupabaseAdmin()
  const { data, error } = await admin.from(TASKS).select('*').eq('batch_id', batchId).maybeSingle()
  if (error) throw new Error(error.message)
  return data
}

export async function getBatchTaskForTeacher(batchId, teacherId) {
  const task = await getBatchTask(batchId)
  if (!task) return null
  if (task.teacher_id !== teacherId) return null
  return task
}

/** 任务级 status：running=处理中，partial=部分完成，failed=失败待重试；超过 staleMinutes 未更新视为卡住 */
export async function listStuckBatchTasks(staleMinutes = 10) {
  const admin = getSupabaseAdmin()
  const cutoff = staleCutoffIso(staleMinutes)
  const { data, error } = await admin
    .from(TASKS)
    .select('*')
    .in('status', ['running', 'partial', 'failed'])
    .lt('updated_at', cutoff)
    .order('updated_at', { ascending: true })
    .limit(30)
  if (error) throw new Error(error.message)
  return data ?? []
}

/** 将长时间处于 processing 的分块重置为 pending，便于 worker 重新处理 */
export async function resetStuckProcessingItems(batchId, staleMinutes = 10) {
  const admin = getSupabaseAdmin()
  const cutoff = staleCutoffIso(staleMinutes)
  const { data, error } = await admin
    .from(ITEMS)
    .update({ status: 'pending', updated_at: nowIso() })
    .eq('batch_id', batchId)
    .eq('status', 'processing')
    .lt('updated_at', cutoff)
    .select('id')
  if (error) throw new Error(error.message)
  return data?.length ?? 0
}

/** 无 pending 但仍有 processing 时，强制全部重置为 pending（用于 worker 续跑） */
export async function forceResetAllProcessingItems(batchId) {
  const admin = getSupabaseAdmin()
  const { data, error } = await admin
    .from(ITEMS)
    .update({ status: 'pending', error_message: null, updated_at: nowIso() })
    .eq('batch_id', batchId)
    .eq('status', 'processing')
    .select('id')
  if (error) throw new Error(error.message)
  return data?.length ?? 0
}

export async function listBatchTasksByTeacher(teacherId, limit = 30) {
  const admin = getSupabaseAdmin()
  const { data, error } = await admin
    .from(TASKS)
    .select('*')
    .eq('teacher_id', teacherId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function markBatchRunning(batchId) {
  const admin = getSupabaseAdmin()
  const { error } = await admin.from(TASKS).update({ status: 'running', updated_at: nowIso() }).eq('batch_id', batchId)
  if (error) throw new Error(error.message)
}

/** 启动 worker 前将 failed/partial 重置为 pending，便于自愈重跑 */
export async function resetBatchTaskToPending(batchId) {
  const admin = getSupabaseAdmin()
  const { error } = await admin.from(TASKS).update({
    status: 'pending',
    error_message: null,
    updated_at: nowIso(),
  }).eq('batch_id', batchId)
  if (error) throw new Error(error.message)
}

/** 将 failed 分块重置为 pending，便于重跑 */
export async function resetFailedItemsToPending(batchId) {
  const admin = getSupabaseAdmin()
  const { data, error } = await admin
    .from(ITEMS)
    .update({ status: 'pending', error_message: null, updated_at: nowIso() })
    .eq('batch_id', batchId)
    .eq('status', 'failed')
    .select('id')
  if (error) throw new Error(error.message)
  return data?.length ?? 0
}

/** 将全部非 pending 分块重置为 pending（重新拆题） */
export async function resetAllItemsToPending(batchId) {
  const admin = getSupabaseAdmin()
  const { data, error } = await admin
    .from(ITEMS)
    .update({ status: 'pending', error_message: null, updated_at: nowIso() })
    .eq('batch_id', batchId)
    .neq('status', 'pending')
    .select('id')
  if (error) throw new Error(error.message)
  return data?.length ?? 0
}

/** 清空批次题库记录（重新拆题前） */
export async function clearBatchQuestionBank(batchId) {
  const admin = getBatchQuestionBankClient()
  const { error } = await admin.from(BANK).delete().eq('batch_id', batchId)
  if (error) throw new Error(error.message)
}

export async function updateBatchProgress(batchId, { completedItems, totalQuestions, status }) {
  const admin = getSupabaseAdmin()
  const patch = { updated_at: nowIso() }
  if (completedItems != null) patch.completed_items = completedItems
  if (totalQuestions != null) patch.total_questions = totalQuestions
  if (status) patch.status = status
  const { error } = await admin.from(TASKS).update(patch).eq('batch_id', batchId)
  if (error) throw new Error(error.message)
}

export async function markBatchFailed(batchId, message) {
  let realCount = 0
  try {
    realCount = await countBatchQuestionsInBank(batchId)
  } catch (err) {
    console.warn('[markBatchFailed] 查询 batch_question_bank 失败，继续标记 failed', {
      batchId,
      message: err instanceof Error ? err.message : String(err),
    })
  }

  if (realCount > 0) {
    const counts = await countItemsByStatus(batchId).catch(() => ({}))
    const status = (counts.failed ?? 0) > 0 ? 'partial' : 'completed'
    const admin = getSupabaseAdmin()
    const { error } = await admin.from(TASKS).update({
      status,
      imported_questions: realCount,
      total_questions: realCount,
      error_message: null,
      updated_at: nowIso(),
    }).eq('batch_id', batchId)
    if (error) throw new Error(error.message)
    console.log('[markBatchFailed] 库中已有题目，跳过 failed 并修正为', {
      batchId,
      realCount,
      status,
      originalMessage: message,
    })
    return
  }

  const admin = getSupabaseAdmin()
  const { error } = await admin.from(TASKS).update({
    status: 'failed',
    error_message: message,
    updated_at: nowIso(),
  }).eq('batch_id', batchId)
  if (error) throw new Error(error.message)
}

/** 列表/进度查询前：按 batch_question_bank 真实数量修正任务状态与计数 */
export async function reconcileBatchTaskFromBank(batchId) {
  const task = await getBatchTask(batchId)
  if (!task) return null

  let realCount = 0
  try {
    realCount = await countBatchQuestionsInBank(batchId)
  } catch {
    return task
  }

  const counts = await countItemsByStatus(batchId)
  const hasWorkRemaining = (counts.pending ?? 0) > 0 || (counts.processing ?? 0) > 0
  if (hasWorkRemaining) return task

  let nextStatus = task.status
  if (realCount > 0) {
    nextStatus = (counts.failed ?? 0) > 0 ? 'partial' : 'completed'
  } else if (['running', 'pending'].includes(task.status)) {
    nextStatus = 'failed'
  }

  const needsUpdate =
    task.imported_questions !== realCount
    || task.total_questions !== realCount
    || (realCount > 0 && (task.status === 'failed' || task.status === 'running'))
    || (realCount > 0 && nextStatus !== task.status)

  if (!needsUpdate) return task

  const admin = getSupabaseAdmin()
  const patch = {
    imported_questions: realCount,
    total_questions: realCount,
    updated_at: nowIso(),
  }
  if (!hasWorkRemaining) {
    patch.status = nextStatus
    patch.error_message = realCount > 0 ? null : task.error_message
  }

  const { error } = await admin.from(TASKS).update(patch).eq('batch_id', batchId)
  if (error) throw new Error(error.message)

  console.log('[batchTaskStore] reconcileBatchTaskFromBank', {
    batchId,
    realCount,
    previousStatus: task.status,
    nextStatus: patch.status ?? task.status,
  })
  return getBatchTask(batchId)
}

export async function markBatchCompleted(batchId) {
  const admin = getSupabaseAdmin()
  const task = await getBatchTask(batchId)
  const { error } = await admin.from(TASKS).update({
    status: task?.status === 'partial' ? 'partial' : 'completed',
    completed_items: task?.total_items ?? 0,
    updated_at: nowIso(),
  }).eq('batch_id', batchId)
  if (error) throw new Error(error.message)
}

export async function fetchPendingItems(batchId, limit = 10) {
  const admin = getSupabaseAdmin()
  const { data, error } = await admin
    .from(ITEMS)
    .select('*')
    .eq('batch_id', batchId)
    .eq('status', 'pending')
    .order('item_index', { ascending: true })
    .limit(limit)
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function markItemProcessing(itemId) {
  const admin = getSupabaseAdmin()
  await admin.from(ITEMS).update({ status: 'processing', updated_at: nowIso() }).eq('id', itemId)
}

export async function markItemCompleted(itemId, questions) {
  const admin = getSupabaseAdmin()
  const { error } = await admin.from(ITEMS).update({
    status: 'completed',
    question_count: questions.length,
    result: { questions },
    updated_at: nowIso(),
  }).eq('id', itemId)
  if (error) throw new Error(error.message)
}

export async function markItemFailed(itemId, message) {
  const admin = getSupabaseAdmin()
  await admin.from(ITEMS).update({
    status: 'failed',
    error_message: message,
    updated_at: nowIso(),
  }).eq('id', itemId)
}

export async function countItemsByStatus(batchId) {
  const admin = getSupabaseAdmin()
  const { data, error } = await admin.from(ITEMS).select('status').eq('batch_id', batchId)
  if (error) throw new Error(error.message)
  const counts = { pending: 0, processing: 0, completed: 0, failed: 0 }
  for (const row of data ?? []) {
    if (counts[row.status] != null) counts[row.status]++
  }
  return counts
}

export async function insertBatchQuestions(batchId, teacherId, itemId, questions, taskMeta = {}, options = {}) {
  const { syncTaskCounts = false, syncTeacherBank = false } = options
  const rawQuestions = Array.isArray(questions) ? questions : []
  const questionCount = rawQuestions.length
  console.log('[入库] 收到题目数据，数量=' + questionCount, { batchId, itemId, teacherId })

  if (!questionCount) {
    console.warn('[入库] 入参为空数组，拒绝写入', { batchId, itemId, teacherId })
    return { success: false, count: 0, error: '入参 rawQuestions 为空数组，无法入库' }
  }

  logSupabaseInsertEnv(batchId)

  let admin
  try {
    admin = getBatchQuestionBankClient()
    console.log('[Supabase] 使用 SERVICE_ROLE_KEY，RLS 已绕过', { batchId, table: BANK })
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    console.error('[入库失败] Supabase 客户端初始化失败', { batchId, detail })
    return failBatchInsert(batchId, itemId, 'Supabase 客户端初始化失败', detail)
  }

  const rows = rawQuestions.map((q, i) => normalizeBankInsertRow(q, batchId, teacherId, itemId, i, taskMeta))

  console.log('[入库] 首条题目完整 JSON', JSON.stringify(rows[0], null, 2))
  console.log('[入库] 首条题目摘要', { batchId, itemId, ...summarizeBankRow(rows[0]) })

  // 写入：不带 .select('id')，避免 service_role + RLS 导致空返回误判
  const { error, status, statusText } = await admin.from(BANK).insert(rows)
  console.log('[入库] insert 响应', { batchId, itemId, status, statusText, hasError: Boolean(error) })

  if (error) {
    console.error('[入库失败] batch_question_bank 写入错误（完整 Supabase 错误）', {
      batchId,
      itemId,
      teacherId,
      rowCount: rows.length,
      httpStatus: status,
      statusText,
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
      fullErrorJson: JSON.stringify(error, Object.getOwnPropertyNames(error)),
    })
    return failBatchInsert(
      batchId,
      itemId,
      'batch_question_bank 入库失败',
      formatSupabaseError(error),
    )
  }

  // 写入后按 item 验证（单轮批量入库时不重复全表 COUNT）
  const { count: verifyCount, error: verifyErr } = await admin
    .from(BANK)
    .select('id', { count: 'exact', head: true })
    .eq('batch_id', batchId)
    .eq('item_id', itemId)
  const insertedCount = verifyErr ? rows.length : (verifyCount ?? rows.length)
  console.log('[入库] item COUNT 验证', { batchId, itemId, verifyCount, hasVerifyErr: Boolean(verifyErr) })

  if (verifyErr) {
    console.warn('[入库] item COUNT 验证失败，按写入行数继续', { batchId, itemId, message: verifyErr.message })
  }

  if (!verifyErr && insertedCount === 0) {
    console.warn('[入库] item COUNT=0，数据可能未写入或被 RLS 拦截', { batchId, itemId, attempted: rows.length })
  }

  // teacher_question_bank 同步：改为后台静默写入，失败不阻断主流程
  // 对标学科网：题目入库优先保证 batch_question_bank 成功，teacher_question_bank 同步为增强功能
  if (syncTeacherBank) {
    // 后台异步写入，不 await，不阻断返回
    Promise.resolve().then(async () => {
      try {
        const tqbRows = rows.map((q) => ({
          teacher_id: teacherId,
          subject: q.subject,
          grade: q.grade,
          knowledge_point: q.knowledge_point,
          question_type: q.question_type,
          difficulty: q.difficulty,
          content: q.content,
          options: q.options,
          answer: q.answer,
          analysis: q.analysis,
          source: '批量拆题',
          tags: q.tags,
          updated_at: nowIso(),
        }))
        const { error: tqbErr } = await admin.from('teacher_question_bank').insert(tqbRows)
        if (tqbErr) {
          console.warn('[入库] teacher_question_bank 后台同步失败（已忽略，不影响入库）', {
            batchId, itemId, message: tqbErr.message,
          })
        } else {
          console.log('[入库] teacher_question_bank 后台同步成功', { batchId, itemId, count: tqbRows.length })
        }
      } catch (syncErr) {
        console.warn('[入库] teacher_question_bank 后台同步异常（已忽略）', {
          batchId, itemId,
          error: syncErr instanceof Error ? syncErr.message : String(syncErr),
        })
      }
    }).catch((e) => {
      console.error('[入库] teacher_question_bank 后台同步 Promise 异常', { error: e instanceof Error ? e.message : String(e) })
    })
  }

  const finalCount = insertedCount > 0 ? insertedCount : rows.length

  // 写入成功：必须同步 batch_decompose_tasks.total_questions / imported_questions
  let actualTotal = finalCount
  try {
    actualTotal = await syncImportedQuestionsFromBank(batchId)
    console.log('[入库] 已同步 batch_decompose_tasks 题目数', {
      batchId,
      imported_questions: actualTotal,
      total_questions: actualTotal,
      itemWritten: finalCount,
    })
  } catch (syncErr) {
    console.error('[入库] 同步 total_questions/imported_questions 失败', {
      batchId,
      itemId,
      message: syncErr instanceof Error ? syncErr.message : String(syncErr),
      stack: syncErr instanceof Error ? syncErr.stack : undefined,
    })
  }

  console.log(`[入库成功] 共写入 ${finalCount} 题`, { batchId, itemId, teacherId, actualTotal })
  return { success: true, count: finalCount, actualTotal }
}

const BANK_SELECT_FIELDS = [
  'id',
  'batch_id',
  'teacher_id',
  'item_id',
  'subject',
  'grade',
  'knowledge_point',
  'question_type',
  'difficulty',
  'content',
  'options',
  'answer',
  'analysis',
  'geometry_desc',
  'latex_blocks',
  'source',
  'tags',
  'sort_order',
  'question_number',
  'created_at',
].join(', ')

export function normalizeBatchQuestionRow(row) {
  if (!row) return null
  return {
    id: row.id,
    batch_id: row.batch_id,
    teacher_id: row.teacher_id,
    item_id: row.item_id,
    subject: row.subject ?? '数学',
    grade: row.grade ?? '八年级',
    knowledge_point: row.knowledge_point ?? '未分类',
    question_type: row.question_type ?? '应用题',
    difficulty: row.difficulty ?? '中等',
    content: row.content ?? '',
    options: Array.isArray(row.options) ? row.options : [],
    answer: row.answer ?? '暂无',
    analysis: row.analysis ?? '暂无',
    geometry_desc: row.geometry_desc ?? '',
    latex_blocks: Array.isArray(row.latex_blocks) ? row.latex_blocks : [],
    source: row.source ?? '批量拆题',
    tags: Array.isArray(row.tags) ? row.tags : [],
    sort_order: row.sort_order ?? 0,
    question_number: row.question_number ?? '',
    created_at: row.created_at,
  }
}

/** 从 batch_question_bank 统计批次实际入库题目数 */
export async function countBatchQuestionsInBank(batchId) {
  const admin = getBatchQuestionBankClient()
  const { count, error } = await admin
    .from(BANK)
    .select('id', { count: 'exact', head: true })
    .eq('batch_id', batchId)
  if (error) {
    console.error('[batchTaskStore] countBatchQuestionsInBank 失败', {
      batchId,
      message: error.message,
      code: error.code,
    })
    throw new Error(error.message)
  }
  const actual = count ?? 0
  console.log('[batchTaskStore] batch_question_bank 实际题目数', { batchId, count: actual })
  return actual
}

/**
 * Worker 全局异常紧急恢复：以 batch_question_bank 真实 COUNT 决定最终状态
 * @returns {Promise<{ recovered: boolean, status: string, realCount: number, message?: string, done?: boolean }>}
 */
export async function emergencyRecover(batchId, errorReason = 'Worker 异常') {
  const reason = String(errorReason ?? 'Worker 异常').trim() || 'Worker 异常'
  console.error('[batchTaskStore] emergencyRecover 触发', { batchId, errorReason: reason })

  let realCount = 0
  try {
    realCount = await countBatchQuestionsInBank(batchId)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[batchTaskStore] emergencyRecover 查询题目数失败', { batchId, msg })
    await markBatchFailed(batchId, `${reason}（且无法查询 batch_question_bank：${msg}）`)
    return { recovered: false, status: 'failed', realCount: 0, message: reason, done: true }
  }

  if (realCount > 0) {
    const admin = getSupabaseAdmin()
    const { error } = await admin.from(TASKS).update({
      imported_questions: realCount,
      total_questions: realCount,
      status: 'completed',
      error_message: null,
      updated_at: nowIso(),
    }).eq('batch_id', batchId)
    if (error) {
      console.error('[batchTaskStore] emergencyRecover 更新任务状态失败', { batchId, message: error.message })
      throw new Error(error.message)
    }
    console.log(`[紧急恢复] batchId=${batchId}，数据库实际题目数=${realCount}，已强制修正为 completed`)
    return { recovered: true, status: 'completed', realCount, done: true }
  }

  await markBatchFailed(batchId, reason)
  console.log(`[紧急恢复] batchId=${batchId}，数据库实际题目数=0，已标记为 failed`, { reason })
  return { recovered: false, status: 'failed', realCount: 0, message: reason, done: true }
}

/** 标记 failed 前兜底：若 batch_question_bank 已有题目则强制 completed/partial */
export async function recoverTaskStatusFromBankCount(batchId, itemCounts = {}) {
  const realCount = await countBatchQuestionsInBank(batchId)
  if (realCount <= 0) {
    return { corrected: false, realCount: 0, status: 'failed' }
  }

  let status = 'completed'
  if ((itemCounts.failed ?? 0) > 0) {
    status = 'partial'
  }

  const admin = getSupabaseAdmin()
  const { error } = await admin.from(TASKS).update({
    imported_questions: realCount,
    total_questions: realCount,
    status,
    error_message: null,
    updated_at: nowIso(),
  }).eq('batch_id', batchId)

  if (error) throw new Error(error.message)

  console.log(`[最终兜底] 任务状态已根据数据库实际题目数(count=${realCount})强制修正为 ${status}`)
  return { corrected: true, realCount, status }
}

/** 以 batch_question_bank 真实 COUNT 收尾任务（禁止依赖内存计数） */
export async function finalizeBatchTaskFromDatabase(batchId, itemCounts = {}) {
  const realCount = await countBatchQuestionsInBank(batchId)

  let status = realCount > 0 ? 'completed' : 'failed'
  if (realCount > 0 && (itemCounts.failed ?? 0) > 0) {
    status = 'partial'
  }

  const admin = getSupabaseAdmin()
  const patch = {
    imported_questions: realCount,
    total_questions: realCount,
    status,
    completed_items: (itemCounts.completed ?? 0) + (itemCounts.failed ?? 0),
    updated_at: nowIso(),
  }

  if (status === 'failed') {
    // 收集所有 failed item 的错误原因用于排查
    let itemsErrorInfo = ''
    try {
      const { data: failedItems } = await admin.from(ITEMS)
        .select('item_index, error_message')
        .eq('batch_id', batchId)
        .eq('status', 'failed')
        .limit(5)
      if (failedItems && failedItems.length > 0) {
        const errors = failedItems.map(it => `[分块${it.item_index}] ${(it.error_message || '未知').slice(0, 100)}`)
        itemsErrorInfo = ' | 分块错误: ' + errors.join('; ')
      }
    } catch (e) {
      itemsErrorInfo = ' | (无法查询分块错误: ' + (e instanceof Error ? e.message : String(e)) + ')'
    }
    patch.error_message = '拆题流程结束但未检测到入库题目（batch_question_bank count=0）。' +
      `total_items=${itemCounts.completed + itemCounts.failed + (itemCounts.pending ?? 0) + (itemCounts.processing ?? 0)}, ` +
      `completed=${itemCounts.completed ?? 0}, failed=${itemCounts.failed ?? 0}` +
      itemsErrorInfo
  } else {
    patch.error_message = null
  }

  const { error } = await admin.from(TASKS).update(patch).eq('batch_id', batchId)
  if (error) throw new Error(error.message)

  console.log(`[最终状态] batchId=${batchId}，真实入库数量=${realCount}，任务状态=${status}`)

  if (realCount > 0 && status !== 'failed') {
    const task = await getBatchTask(batchId)
    if (task?.teacher_id) {
      syncTeacherQuestionBankFromBatch(batchId, task.teacher_id).catch((err) => {
        console.warn('[batchTaskStore] teacher_question_bank 后台同步失败', {
          batchId,
          message: err instanceof Error ? err.message : String(err),
        })
      })
    }
  }

  return { realCount, status }
}

/** 任务完成后将 batch_question_bank 题目同步至 teacher_question_bank（后台异步） */
export async function syncTeacherQuestionBankFromBatch(batchId, teacherId) {
  const admin = getBatchQuestionBankClient()
  const { data, error } = await admin
    .from(BANK)
    .select('subject, grade, knowledge_point, question_type, difficulty, content, options, answer, analysis, tags')
    .eq('batch_id', batchId)
    .eq('teacher_id', teacherId)
  if (error) throw new Error(error.message)
  if (!data?.length) return 0

  const tqbRows = data.map((q) => ({
    teacher_id: teacherId,
    subject: q.subject,
    grade: q.grade,
    knowledge_point: q.knowledge_point,
    question_type: q.question_type,
    difficulty: q.difficulty,
    content: q.content,
    options: q.options ?? [],
    answer: q.answer,
    analysis: q.analysis,
    source: '批量拆题',
    tags: q.tags ?? [],
    updated_at: nowIso(),
  }))

  const { error: tqbErr } = await getSupabaseAdmin().from('teacher_question_bank').insert(tqbRows)
  if (tqbErr) throw new Error(tqbErr.message)

  console.log('[batchTaskStore] teacher_question_bank 批量同步完成', { batchId, count: tqbRows.length })
  return tqbRows.length
}

/** 以 batch_question_bank 实际数量同步 batch_decompose_tasks.imported_questions */
export async function syncImportedQuestionsFromBank(batchId) {
  const actualCount = await countBatchQuestionsInBank(batchId)
  const admin = getSupabaseAdmin()
  const { error } = await admin.from(TASKS).update({
    imported_questions: actualCount,
    total_questions: actualCount,
    updated_at: nowIso(),
  }).eq('batch_id', batchId)
  if (error) throw new Error(error.message)
  console.log('[batchTaskStore] 已同步 imported_questions', { batchId, imported_questions: actualCount })
  return actualCount
}

/** 从 batch_question_bank 查询批次题目（service_role 绕过 RLS） */
export async function listBatchQuestions(batchId, teacherId) {
  const admin = getBatchQuestionBankClient()
  const { data, error } = await admin
    .from(BANK)
    .select(BANK_SELECT_FIELDS)
    .eq('batch_id', batchId)
    .eq('teacher_id', teacherId)
    .order('sort_order', { ascending: true })

  if (error) {
    console.error('[listBatchQuestions] batch_question_bank 查询失败', {
      batchId,
      teacherId,
      message: error.message,
      code: error.code,
    })
    throw new Error(error.message)
  }

  const items = (data ?? []).map(normalizeBatchQuestionRow).filter(Boolean)
  console.log('[listBatchQuestions] batch_question_bank 查询结果', {
    batchId,
    teacherId,
    count: items.length,
  })
  return items
}

export function formatBatchProgress(task, itemCounts) {
  const total = task.total_items || 0
  const done = (itemCounts.completed ?? 0) + (itemCounts.failed ?? 0)
  const percent = total > 0 ? Math.round((done / total) * 100) : 0
  return {
    batchId: task.batch_id,
    teacherId: task.teacher_id,
    fileName: task.file_name,
    subject: task.subject,
    grade: task.grade,
    status: task.status,
    totalItems: total,
    completedItems: itemCounts.completed ?? 0,
    failedItems: itemCounts.failed ?? 0,
    pendingItems: itemCounts.pending ?? 0,
    processingItems: itemCounts.processing ?? 0,
    totalQuestions: task.total_questions ?? 0,
    importedQuestions: task.imported_questions ?? 0,
    progressPercent: percent,
    errorMessage: task.error_message,
    createdAt: task.created_at,
    updatedAt: task.updated_at,
  }
}
