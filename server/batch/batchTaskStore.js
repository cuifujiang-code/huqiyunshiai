import { getSupabaseAdmin, isSupabaseAdminConfigured } from '../supabaseAdmin.js'
import { sanitizeAnalysisText } from './questionContentSanitizer.js'

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

/** 入库专用：service_role + 与 supabaseAdmin 一致的 URL 解析（含 VITE_SUPABASE_URL） */
function getBatchInsertSupabaseAdmin() {
  return getSupabaseAdmin()
}

function normalizeBankInsertRow(q, batchId, teacherId, itemId, fallbackIndex) {
  const sortOrder = Number.isFinite(Number(q.sort_order)) ? Number(q.sort_order) : fallbackIndex + 1
  const rawContent = String(q.content ?? '').trim()
  const questionNumber = String(q.question_number ?? q.questionNumber ?? '').trim() || String(sortOrder)
  const knowledge_point_ids = Array.isArray(q.knowledge_point_ids) ? q.knowledge_point_ids : []
  return {
    batch_id: batchId,
    teacher_id: teacherId,
    item_id: itemId ?? null,
    subject: String(q.subject ?? '').trim() || '数学',
    grade: String(q.grade ?? '').trim() || '八年级',
    knowledge_point: String(q.knowledge_point ?? '').trim() || '未分类',
    knowledge_point_ids,
    question_type: String(q.question_type ?? '').trim() || '应用题',
    difficulty: String(q.difficulty ?? '').trim() || '中等',
    content: rawContent || `题目 ${sortOrder}`,
    options: Array.isArray(q.options) ? q.options : [],
    answer: String(q.answer ?? '').trim() || '暂无',
    analysis: sanitizeAnalysisText(String(q.analysis ?? '').trim() || '暂无'),
    geometry_desc: String(q.geometry_desc ?? '').trim() || '',
    latex_blocks: Array.isArray(q.latex_blocks) ? q.latex_blocks : [],
    source: String(q.source ?? '').trim() || '批量拆题',
    ability_dimension: String(q.ability_dimension ?? '').trim() || '',
    suitable_stage: String(q.suitable_stage ?? '').trim() || '',
    estimated_time: q.estimated_time != null && q.estimated_time !== '' ? Number(q.estimated_time) : null,
    tags: Array.isArray(q.tags) ? q.tags : [],
    sort_order: sortOrder,
    question_number: questionNumber,
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

  const { error: taskErr } = await admin.from(TASKS).insert({
    batch_id: batchId,
    teacher_id: teacherId,
    file_name: fileName ?? '',
    subject: subject || '数学',
    grade: grade || '八年级',
    status: 'pending',
    total_items: chunks.length,
    completed_items: 0,
    total_questions: 0,
    imported_questions: 0,
    meta: meta ?? {},
    updated_at: nowIso(),
  })
  if (taskErr) throw new Error(taskErr.message)

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
  if (itemsErr) throw new Error(itemsErr.message)

  return { batchId, totalItems: chunks.length }
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

/** 任务级 status：running=处理中，partial=部分完成；超过 staleMinutes 未更新视为卡住 */
export async function listStuckBatchTasks(staleMinutes = 10) {
  const admin = getSupabaseAdmin()
  const cutoff = staleCutoffIso(staleMinutes)
  const { data, error } = await admin
    .from(TASKS)
    .select('*')
    .in('status', ['running', 'partial'])
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
  const { error } = await admin.from(TASKS).update({
    status: 'running',
    error_message: null,
    updated_at: nowIso(),
  }).eq('batch_id', batchId)
  if (error) throw new Error(error.message)
}

/** 启动 worker 前将 failed/partial 任务重置为 pending，并清除错误信息 */
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
  const admin = getBatchInsertSupabaseAdmin()
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
  const admin = getSupabaseAdmin()
  const { error } = await admin.from(TASKS).update({
    status: 'failed',
    error_message: message,
    updated_at: nowIso(),
  }).eq('batch_id', batchId)
  if (error) throw new Error(error.message)
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

export async function insertBatchQuestions(batchId, teacherId, itemId, questions) {
  if (!questions.length) return { success: true, count: 0 }

  console.log(`[入库] batchId=${batchId}, itemId=${itemId}, 待写入题目数=${questions.length}`)

  let admin
  try {
    admin = getBatchInsertSupabaseAdmin()
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    return failBatchInsert(batchId, itemId, 'Supabase 客户端初始化失败', detail)
  }

  const rows = questions.map((q, i) => normalizeBankInsertRow(q, batchId, teacherId, itemId, i))

  const { error } = await admin.from(BANK).insert(rows)
  if (error) {
    const detail = formatSupabaseError(error)
    console.error('[入库失败] batch_question_bank 写入错误', {
      batchId,
      itemId,
      teacherId,
      rowCount: rows.length,
      sampleRow: rows[0],
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    })
    return failBatchInsert(batchId, itemId, 'batch_question_bank 入库失败', detail)
  }

  // 同步写入教师主题库（后台静默，失败不阻断主流程）
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
        console.warn('[入库] teacher_question_bank 同步失败（不影响主流程）', {
          batchId,
          itemId,
          message: tqbErr.message,
          code: tqbErr.code,
        })
      } else {
        console.log(`[入库] teacher_question_bank 同步成功: ${tqbRows.length} 条`)
      }
    } catch (tqbCatchErr) {
      console.warn('[入库] teacher_question_bank 同步异常（不影响主流程）', {
        batchId,
        itemId,
        error: tqbCatchErr instanceof Error ? tqbCatchErr.message : String(tqbCatchErr),
      })
    }
  })

  const task = await getBatchTask(batchId)
  await admin.from(TASKS).update({
    imported_questions: (task?.imported_questions ?? 0) + rows.length,
    total_questions: (task?.total_questions ?? 0) + rows.length,
    updated_at: nowIso(),
  }).eq('batch_id', batchId)

  console.log(`[入库成功] batchId=${batchId}, itemId=${itemId}, 共写入 ${rows.length} 题 → batch_question_bank`)
  return { success: true, count: rows.length }
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

/** 从 batch_question_bank 查询批次题目（按 sort_order 升序） */
export async function listBatchQuestions(batchId, teacherId) {
  const admin = getSupabaseAdmin()
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

function getBatchQuestionBankClient() {
  return getBatchInsertSupabaseAdmin()
}

export async function countBatchQuestionsInBank(batchId) {
  const admin = getBatchQuestionBankClient()
  const { count, error } = await admin
    .from(BANK)
    .select('id', { count: 'exact', head: true })
    .eq('batch_id', batchId)
  if (error) throw new Error(error.message)
  return count ?? 0
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
