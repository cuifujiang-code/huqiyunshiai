import { createClient } from '@supabase/supabase-js'

const TABLE = 'student_photo_search_history'

function getSupabaseUrl() {
  return process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || ''
}

function getServiceRoleKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || ''
}

export function isPhotoSearchStoreConfigured() {
  return Boolean(getSupabaseUrl() && getServiceRoleKey())
}

function getAdminClient() {
  const url = getSupabaseUrl()
  const key = getServiceRoleKey()
  if (!url || !key) {
    throw new Error(
      'Supabase 未配置：请在环境变量中设置 VITE_SUPABASE_URL 与 SUPABASE_SERVICE_ROLE_KEY',
    )
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export async function insertPhotoSearchRecord(row) {
  const admin = getAdminClient()
  const { data, error } = await admin
    .from(TABLE)
    .insert({
      user_id: row.userId || null,
      image_name: row.imageName || '',
      ocr_text: row.ocrText || '',
      question: row.question || '',
      answer: row.answer || '',
      analysis: row.analysis || '',
      knowledge_points: row.knowledgePoints ?? [],
      source: row.source === 'bank' ? 'bank' : 'ai',
      bank_question_id: row.bankQuestionId || null,
      bank_table: row.bankTable || null,
      matched_question: row.matchedQuestion ?? null,
    })
    .select('id, user_id, image_name, ocr_text, question, answer, analysis, knowledge_points, source, bank_question_id, bank_table, matched_question, created_at')
    .single()

  if (error) throw new Error(error.message)
  return data
}

export async function listPhotoSearchHistory(userId, { page = 1, pageSize = 20 } = {}) {
  if (!userId?.trim()) return { items: [], total: 0, page, pageSize }

  const admin = getAdminClient()
  const p = Math.max(1, Number(page) || 1)
  const size = Math.min(50, Math.max(1, Number(pageSize) || 20))
  const from = (p - 1) * size
  const to = from + size - 1

  const { data, error, count } = await admin
    .from(TABLE)
    .select(
      'id, user_id, image_name, ocr_text, question, answer, analysis, knowledge_points, source, bank_question_id, bank_table, matched_question, created_at',
      { count: 'exact' },
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(from, to)

  if (error) throw new Error(error.message)
  return { items: data ?? [], total: count ?? 0, page: p, pageSize: size }
}

export async function getPhotoSearchRecord(userId, id) {
  const admin = getAdminClient()
  let query = admin
    .from(TABLE)
    .select(
      'id, user_id, image_name, ocr_text, question, answer, analysis, knowledge_points, source, bank_question_id, bank_table, matched_question, created_at',
    )
    .eq('id', id)

  if (userId?.trim()) query = query.eq('user_id', userId)

  const { data, error } = await query.maybeSingle()
  if (error) throw new Error(error.message)
  return data
}
