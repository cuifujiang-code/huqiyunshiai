import { getSupabaseAdmin, isSupabaseAdminConfigured } from '../supabaseAdmin.js'

const TABLE = 'teacher_question_bank'

export { isSupabaseAdminConfigured }

function nowIso() {
  return new Date().toISOString()
}

export async function listQuestions(teacherId, filters = {}) {
  const admin = getSupabaseAdmin()
  const page = Math.max(1, Number(filters.page) || 1)
  const pageSize = Math.min(50, Math.max(1, Number(filters.pageSize) || 10))
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let query = admin
    .from(TABLE)
    .select('*', { count: 'exact' })
    .eq('teacher_id', teacherId)
    .order('updated_at', { ascending: false })
    .range(from, to)

  if (filters.subject) query = query.eq('subject', filters.subject)
  if (filters.grade) query = query.eq('grade', filters.grade)
  if (filters.question_type) query = query.eq('question_type', filters.question_type)
  if (filters.difficulty) query = query.eq('difficulty', filters.difficulty)
  if (filters.source) query = query.eq('source', filters.source)
  if (filters.knowledge_point) query = query.ilike('knowledge_point', `%${filters.knowledge_point}%`)
  if (filters.keyword) query = query.ilike('content', `%${filters.keyword}%`)

  const { data, error, count } = await query
  if (error) throw new Error(error.message)
  return { items: data ?? [], total: count ?? 0, page, pageSize }
}

export async function getQuestion(teacherId, id) {
  const admin = getSupabaseAdmin()
  const { data, error } = await admin.from(TABLE).select('*').eq('id', id).eq('teacher_id', teacherId).maybeSingle()
  if (error) throw new Error(error.message)
  return data
}

export async function createQuestion(teacherId, payload) {
  const admin = getSupabaseAdmin()
  const row = {
    teacher_id: teacherId,
    subject: payload.subject,
    grade: payload.grade,
    knowledge_point: payload.knowledge_point || '',
    question_type: payload.question_type,
    difficulty: payload.difficulty || '中等',
    content: payload.content,
    options: payload.options ?? [],
    answer: payload.answer || '',
    analysis: payload.analysis || '',
    source: payload.source || '手动录入',
    tags: payload.tags ?? [],
    updated_at: nowIso(),
  }
  const { data, error } = await admin.from(TABLE).insert(row).select('*').single()
  if (error) throw new Error(error.message)
  return data
}

export async function createQuestionsBatch(teacherId, questions) {
  const rows = questions.map((q) => ({
    teacher_id: teacherId,
    subject: q.subject,
    grade: q.grade,
    knowledge_point: q.knowledge_point || '',
    question_type: q.question_type,
    difficulty: q.difficulty || '中等',
    content: q.content,
    options: q.options ?? [],
    answer: q.answer || '',
    analysis: q.analysis || '',
    source: q.source || '试卷导入',
    tags: q.tags ?? [],
    updated_at: nowIso(),
  }))
  const admin = getSupabaseAdmin()
  const { data, error } = await admin.from(TABLE).insert(rows).select('*')
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function updateQuestion(teacherId, id, payload) {
  const admin = getSupabaseAdmin()
  const { data, error } = await admin
    .from(TABLE)
    .update({ ...payload, updated_at: nowIso() })
    .eq('id', id)
    .eq('teacher_id', teacherId)
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return data
}

export async function deleteQuestions(teacherId, ids) {
  const admin = getSupabaseAdmin()
  const { error } = await admin.from(TABLE).delete().eq('teacher_id', teacherId).in('id', ids)
  if (error) throw new Error(error.message)
}

export async function updateQuestionsTags(teacherId, ids, tags) {
  const admin = getSupabaseAdmin()
  const { error } = await admin
    .from(TABLE)
    .update({ tags, updated_at: nowIso() })
    .eq('teacher_id', teacherId)
    .in('id', ids)
  if (error) throw new Error(error.message)
}

export async function pickQuestionsForExam(teacherId, criteria) {
  const admin = getSupabaseAdmin()
  let query = admin.from(TABLE).select('*').eq('teacher_id', teacherId)
  if (criteria.subject) query = query.eq('subject', criteria.subject)
  if (criteria.grade) query = query.eq('grade', criteria.grade)
  const { data, error } = await query.limit(500)
  if (error) throw new Error(error.message)
  return data ?? []
}
