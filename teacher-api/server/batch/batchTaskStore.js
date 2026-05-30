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

/** 入库专用：强制 service_role，禁止 anon key；URL 与 getSupabaseAdmin 对齐 */
function decodeJwtRole(key) {
  try {
    const parts = String(key).split('.')
    if (parts.length < 2) return null
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
    return payload?.role ?? null
  } catch {
    return null
  }
}

function maskEnvValue(value, prefixLen = 10) {
  if (!value) return '(missing)'
  return `${String(value).slice(0, prefixLen)}…(len=${String(value).length})`
}

function resolveInsertSupabaseConfig() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''
  return { url, key, anonKey }
}

function logSupabaseInsertEnv(batchId) {
  const { url, key, anonKey } = resolveInsertSupabaseConfig()
  const jwtRole = decodeJwtRole(key)
  console.log('[入库] Supabase 环境变量检查', {
    batchId,
    supabaseUrlPrefix: url ? url.slice(0, 20) : '(missing)',
    serviceRoleKeyPrefix: maskEnvValue(key, 10),
    hasSupabaseUrl: Boolean(process.env.SUPABASE_URL),
    hasViteSupabaseUrl: Boolean(process.env.VITE_SUPABASE_URL),
    hasServiceRoleKey: Boolean(key),
    jwtRole: jwtRole ?? '(无法解析)',
    usingViteUrlFallback: !process.env.SUPABASE_URL && Boolean(process.env.VITE_SUPABASE_URL),
    anonKeyMatchesServiceKey: Boolean(anonKey && key && anonKey === key),
  })
}

function getBatchInsertSupabaseAdmin() {
  const { url, key, anonKey } = resolveInsertSupabaseConfig()
  if (!url || !key) {
    throw new Error('Supabase 未配置：请设置 SUPABASE_URL（或 VITE_SUPABASE_URL）与 SUPABASE_SERVICE_ROLE_KEY')
  }
  if (anonKey && key === anonKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY 与 ANON_KEY 相同，请使用 Settings → API → service_role secret')
  }
  const jwtRole = decodeJwtRole(key)
  if (jwtRole === 'anon') {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY 解析为 anon 角色，无法绕过 RLS，请更换为 service_role key')
  }
  if (jwtRole && jwtRole !== 'service_role') {
    console.warn('[入库] JWT role 非 service_role', { jwtRole })
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

function normalizeBankInsertRow(q, batchId, teacherId, itemId, fallbackIndex, taskMeta = {}) {
  const sortOrder = Number.isFinite(Number(q?.sort_order))
    ? Math.max(1, Number(q.sort_order))
    : fallbackIndex + 1
  const rawContent = String(q?.content ?? q?.question ?? q?.title ?? '').trim()
  const questionNumber = String(q?.question_number ?? q?.questionNumber ?? q?.number ?? '').trim() || String(sortOrder)

  const VALID_TYPES = new Set(['选择题', '填空题', '计算题', '证明题', '实验题', '应用题'])
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

export async function insertBatchQuestions(batchId, teacherId, itemId, questions, taskMeta = {}) {
  const questionCount = Array.isArray(questions) ? questions.length : 0
  console.log(`[入库] batchId=${batchId}, 待写入题目数=${questionCount}`)

  logSupabaseInsertEnv(batchId)

  if (!questionCount) {
    const detail = 'AI 拆题结果为空，无可入库题目'
    console.error(`[入库失败] ${detail}`, { batchId, itemId, teacherId })
    return failBatchInsert(batchId, itemId, '无可入库题目', detail)
  }

  let admin
  try {
    admin = getBatchInsertSupabaseAdmin()
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    console.error('[入库失败] Supabase 客户端初始化失败', { batchId, detail })
    return failBatchInsert(batchId, itemId, 'Supabase 客户端初始化失败', detail)
  }

  const rows = questions.map((q, i) => normalizeBankInsertRow(q, batchId, teacherId, itemId, i, taskMeta))

  console.log('[入库] 首条题目完整 JSON', JSON.stringify(rows[0], null, 2))
  console.log('[入库] 首条题目摘要', { batchId, itemId, ...summarizeBankRow(rows[0]) })

  const { data: insertedRows, error, status, statusText } = await admin.from(BANK).insert(rows).select('id, batch_id, item_id')
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
      fullError: error,
    })
    return failBatchInsert(
      batchId,
      itemId,
      'batch_question_bank 入库失败',
      formatSupabaseError(error),
    )
  }

  const insertedCount = insertedRows?.length ?? 0
  if (!insertedCount) {
    console.warn('[入库失败] 数据被 RLS 或约束拦截：insert 无 error 但 select 返回空数组', {
      batchId,
      itemId,
      teacherId,
      attemptedRows: rows.length,
      httpStatus: status,
    })
    return failBatchInsert(
      batchId,
      itemId,
      'batch_question_bank 入库失败',
      '数据被 RLS 或约束拦截：insert 成功但未返回行，请确认 SUPABASE_SERVICE_ROLE_KEY 为 service_role 而非 anon key',
    )
  }

  // 二次校验：确认数据库中可读
  const { count: verifyCount, error: verifyErr } = await admin
    .from(BANK)
    .select('id', { count: 'exact', head: true })
    .eq('batch_id', batchId)
    .eq('item_id', itemId)
  if (verifyErr) {
    console.warn('[入库] 写入后校验查询失败', { batchId, itemId, message: verifyErr.message })
  } else if (!verifyCount) {
    console.warn('[入库失败] 写入后校验 count=0，数据可能被 RLS 拦截', { batchId, itemId })
    return failBatchInsert(
      batchId,
      itemId,
      'batch_question_bank 入库校验失败',
      'insert 返回成功但按 batch_id+item_id 查询 count=0，请检查 RLS 与 service_role key',
    )
  } else {
    console.log('[入库] 写入后校验通过', { batchId, itemId, verifyCount })
  }

  // 同步写入教师主题库（失败不阻断 batch_question_bank 入库，仅记录警告）
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
      console.warn('[入库] teacher_question_bank 同步失败（batch_question_bank 已写入）', {
        batchId,
        itemId,
        message: tqbErr.message,
        code: tqbErr.code,
        details: tqbErr.details,
        hint: tqbErr.hint,
      })
    }
  } catch (syncErr) {
    console.warn('[入库] teacher_question_bank 同步异常（batch_question_bank 已写入）', {
      batchId,
      itemId,
      error: syncErr instanceof Error ? syncErr.message : String(syncErr),
    })
  }

  const task = await getBatchTask(batchId)
  const { error: progressErr } = await admin.from(TASKS).update({
    imported_questions: (task?.imported_questions ?? 0) + insertedCount,
    total_questions: (task?.total_questions ?? 0) + insertedCount,
    updated_at: nowIso(),
  }).eq('batch_id', batchId)
  if (progressErr) {
    console.error('[入库] 更新 imported_questions 失败', {
      batchId,
      message: progressErr.message,
      code: progressErr.code,
    })
  }

  console.log(`[入库成功] 共写入 ${insertedCount} 题`, { batchId, itemId, teacherId })
  return { success: true, count: insertedCount }
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
