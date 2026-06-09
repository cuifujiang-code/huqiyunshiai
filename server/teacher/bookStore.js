import { getSupabaseAdmin } from '../supabaseAdmin.js'

const TABLE = 'books'

function nowIso() {
  return new Date().toISOString()
}

export async function listBooks(teacherId) {
  const admin = getSupabaseAdmin()
  const { data, error } = await admin
    .from(TABLE)
    .select('id, title, grade, level, created_at, updated_at')
    .eq('teacher_id', teacherId)
    .order('updated_at', { ascending: false })
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function getBook(teacherId, id) {
  const admin = getSupabaseAdmin()
  const { data, error } = await admin.from(TABLE).select('*').eq('id', id).eq('teacher_id', teacherId).maybeSingle()
  if (error) throw new Error(error.message)
  return data
}

export async function saveBook(teacherId, payload) {
  const admin = getSupabaseAdmin()
  const row = {
    teacher_id: teacherId,
    title: payload.title,
    grade: payload.grade || '',
    level: payload.level || '基础',
    chapters: payload.chapters ?? [],
    cover_style: payload.coverStyle ?? payload.cover_style ?? 'academic',
    knowledge_graph: payload.knowledgeGraph ?? payload.knowledge_graph ?? null,
    layout_template: payload.layoutTemplate ?? payload.layout_template ?? 'classic',
    layout_settings: payload.layoutSettings ?? payload.layout_settings ?? {},
    foreword: payload.foreword ?? '',
    epilogue: payload.epilogue ?? '',
    updated_at: nowIso(),
  }
  if (payload.id) {
    const { data, error } = await admin.from(TABLE).update(row).eq('id', payload.id).eq('teacher_id', teacherId).select('*').single()
    if (error) throw new Error(error.message)
    return data
  }
  const { data, error } = await admin.from(TABLE).insert(row).select('*').single()
  if (error) throw new Error(error.message)
  return data
}

export async function deleteBook(teacherId, id) {
  const admin = getSupabaseAdmin()
  const { error } = await admin.from(TABLE).delete().eq('id', id).eq('teacher_id', teacherId)
  if (error) throw new Error(error.message)
}
