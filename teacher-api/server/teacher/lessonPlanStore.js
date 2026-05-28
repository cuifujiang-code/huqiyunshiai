import { getSupabaseAdmin } from '../supabaseAdmin.js'

const TABLE = 'lesson_plans'

function nowIso() {
  return new Date().toISOString()
}

export async function listLessonPlans(teacherId) {
  const admin = getSupabaseAdmin()
  const { data, error } = await admin
    .from(TABLE)
    .select('*')
    .eq('teacher_id', teacherId)
    .order('updated_at', { ascending: false })
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function saveLessonPlan(teacherId, payload) {
  const admin = getSupabaseAdmin()
  const row = {
    teacher_id: teacherId,
    title: payload.title,
    objectives: payload.objectives || '',
    question_ids: payload.question_ids ?? [],
    updated_at: nowIso(),
  }
  if (payload.id) {
    const { data, error } = await admin
      .from(TABLE)
      .update(row)
      .eq('id', payload.id)
      .eq('teacher_id', teacherId)
      .select('*')
      .single()
    if (error) throw new Error(error.message)
    return data
  }
  const { data, error } = await admin.from(TABLE).insert(row).select('*').single()
  if (error) throw new Error(error.message)
  return data
}

export async function deleteLessonPlan(teacherId, id) {
  const admin = getSupabaseAdmin()
  const { error } = await admin.from(TABLE).delete().eq('id', id).eq('teacher_id', teacherId)
  if (error) throw new Error(error.message)
}
