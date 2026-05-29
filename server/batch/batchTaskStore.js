import { createClient } from '@supabase/supabase-js'
import { getSupabaseAdmin, isSupabaseAdminConfigured } from '../supabaseAdmin.js'

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

/** 入库专用：强制使用后端 service_role 环境变量（不用 VITE_ / anon key） */
function getBatchInsertSupabaseAdmin() {
  const url = process.env.SUPABASE_URL || ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  if (!url || !key) {
    throw new Error('Supabase 未配置：请设置 SUPABASE_URL 与 SUPABASE_SERVICE_ROLE_KEY')
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

function normalizeBankInsertRow(q, batchId, teacherId, itemId, fallbackIndex) {
  const sortOrder = Number.isFinite(Number(q.sort_order)) ? Number(q.sort_order) : fallbackIndex + 1
  const rawContent = String(q.content ?? '').trim()
  const questionNumber = String(q.question_number ?? q.questionNumber ?? '').trim() || String(sortOrder)
  return {
    batch_id: batchId,
    teacher_id: teacherId,
    item_id: itemId ?? null,
    subject: String(q.subject ?? '').trim() || '数学',
    grade: String(q.grade ?? '').trim() || '八年级',
    knowledge_point: String(q.knowledge_point ?? '').trim() || '未分类',
    question_type: String(q.question_type ?? '').trim() || '应用题',
    difficulty: String(q.difficulty ?? '').trim() || '中等',
    content: rawContent || `题目 ${sortOrder}`,
    options: Array.isArray(q.options) ? q.options : [],
    answer: String(q.answer ?? '').trim() || '暂无',
    analysis: String(q.analysis ?? '').trim() || '暂无',
    geometry_desc: String(q.geometry_desc ?? '').trim() || '',
    latex_blocks: Array.isArray(q.latex_blocks) ? q.latex_blocks : [],
    source: String(q.source ?? '').trim() || '批量拆题',
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
  const { error } = await admin.from(TASKS).update({ status: 'running', updated_at: nowIso() }).eq('batch_id', batchId)
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

  // 同步写入教师主题库
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
    const detail = formatSupabaseError(tqbErr)
    console.error('[入库失败] teacher_question_bank 同步错误', {
      batchId,
      itemId,
      message: tqbErr.message,
      code: tqbErr.code,
      details: tqbErr.details,
      hint: tqbErr.hint,
    })
    return failBatchInsert(batchId, itemId, 'teacher_question_bank 同步失败', detail)
  }

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
