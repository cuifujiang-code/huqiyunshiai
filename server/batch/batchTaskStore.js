import { getSupabaseAdmin, isSupabaseAdminConfigured } from '../supabaseAdmin.js'

const TASKS = 'batch_decompose_tasks'
const ITEMS = 'batch_decompose_items'
const BANK = 'batch_question_bank'

export { isSupabaseAdminConfigured as isBatchStoreConfigured }

function nowIso() {
  return new Date().toISOString()
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
  if (!questions.length) return 0
  const admin = getSupabaseAdmin()
  const rows = questions.map((q) => ({
    batch_id: batchId,
    teacher_id: teacherId,
    item_id: itemId,
    subject: q.subject || '数学',
    grade: q.grade || '八年级',
    knowledge_point: q.knowledge_point ?? '',
    question_type: q.question_type || '应用题',
    difficulty: q.difficulty || '中等',
    content: q.content,
    options: Array.isArray(q.options) ? q.options : [],
    answer: q.answer ?? '',
    analysis: q.analysis ?? '',
    geometry_desc: q.geometry_desc ?? '',
    latex_blocks: Array.isArray(q.latex_blocks) ? q.latex_blocks : [],
    source: q.source || '批量拆题',
    tags: Array.isArray(q.tags) ? q.tags : [],
    sort_order: q.sort_order ?? 0,
  }))

  const { error } = await admin.from(BANK).insert(rows)
  if (error) {
    console.error('[batchTaskStore] batch_question_bank 入库失败', {
      batchId,
      itemId,
      message: error.message,
      code: error.code,
      details: error.details,
    })
    throw new Error(error.message)
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
  await admin.from('teacher_question_bank').insert(tqbRows)

  const task = await getBatchTask(batchId)
  await admin.from(TASKS).update({
    imported_questions: (task?.imported_questions ?? 0) + rows.length,
    total_questions: (task?.total_questions ?? 0) + rows.length,
    updated_at: nowIso(),
  }).eq('batch_id', batchId)

  return rows.length
}

export async function listBatchQuestions(batchId, teacherId) {
  const admin = getSupabaseAdmin()
  const { data, error } = await admin
    .from(BANK)
    .select('*')
    .eq('batch_id', batchId)
    .eq('teacher_id', teacherId)
    .order('sort_order', { ascending: true })
  if (error) throw new Error(error.message)
  return data ?? []
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
