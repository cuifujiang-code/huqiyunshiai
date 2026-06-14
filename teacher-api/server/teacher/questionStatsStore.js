import { getSupabaseAdmin } from '../supabaseAdmin.js'

const TABLE = 'question_stats'

export async function getStatsForQuestion(questionId) {
  const admin = getSupabaseAdmin()
  const { data, error } = await admin.from(TABLE).select('*').eq('question_id', questionId).maybeSingle()
  if (error) throw new Error(error.message)
  return data
}

export async function getStatsForQuestions(questionIds = []) {
  if (!questionIds.length) return {}
  const admin = getSupabaseAdmin()
  const { data, error } = await admin.from(TABLE).select('*').in('question_id', questionIds)
  if (error) throw new Error(error.message)
  const map = {}
  for (const row of data ?? []) map[row.question_id] = row
  return map
}

export async function upsertQuestionStats(questionId, patch) {
  const admin = getSupabaseAdmin()
  const row = {
    question_id: questionId,
    ...patch,
    updated_at: new Date().toISOString(),
  }
  const { data, error } = await admin.from(TABLE).upsert(row).select('*').single()
  if (error) throw new Error(error.message)
  return data
}

/** 学情看板：按知识点聚合错题 */
export async function getAnalyticsDashboard(teacherId, { subject } = {}) {
  const admin = getSupabaseAdmin()
  let qQuery = admin
    .from('teacher_question_bank')
    .select('id, subject, grade, knowledge_point, knowledge_point_ids, question_type, difficulty, content')
    .eq('teacher_id', teacherId)
  if (subject) qQuery = qQuery.eq('subject', subject)
  const { data: questions, error: qErr } = await qQuery.limit(2000)
  if (qErr) throw new Error(qErr.message)

  const ids = (questions ?? []).map((q) => q.id).filter(Boolean)
  const statsMap = await getStatsForQuestions(ids)

  const knowledgeHeatmap = new Map()
  const highErrorQuestions = []

  for (const q of questions ?? []) {
    const stat = statsMap[q.id]
    const kp = q.knowledge_point || '未分类'
    const err = stat?.error_rate != null ? Number(stat.error_rate) : null
    const attempts = stat?.total_attempts ?? 0

    if (!knowledgeHeatmap.has(kp)) {
      knowledgeHeatmap.set(kp, { knowledge_point: kp, question_count: 0, total_attempts: 0, error_rate_sum: 0, error_rate_count: 0 })
    }
    const bucket = knowledgeHeatmap.get(kp)
    bucket.question_count += 1
    bucket.total_attempts += attempts
    if (err != null && attempts > 0) {
      bucket.error_rate_sum += err
      bucket.error_rate_count += 1
    }

    if (stat && attempts >= 3 && err != null && err >= 0.4) {
      highErrorQuestions.push({
        id: q.id,
        subject: q.subject,
        grade: q.grade,
        knowledge_point: kp,
        question_type: q.question_type,
        difficulty: q.difficulty,
        content_preview: String(q.content || '').slice(0, 120),
        total_attempts: attempts,
        error_rate: err,
        avg_score_rate: stat.avg_score_rate != null ? Number(stat.avg_score_rate) : null,
      })
    }
  }

  const heatmap = [...knowledgeHeatmap.values()]
    .map((b) => ({
      knowledge_point: b.knowledge_point,
      question_count: b.question_count,
      total_attempts: b.total_attempts,
      avg_error_rate: b.error_rate_count ? b.error_rate_sum / b.error_rate_count : null,
    }))
    .sort((a, b) => (b.avg_error_rate ?? 0) - (a.avg_error_rate ?? 0))

  highErrorQuestions.sort((a, b) => b.error_rate - a.error_rate)

  return {
    subject: subject || '全部',
    total_questions: questions?.length ?? 0,
    knowledge_heatmap: heatmap.slice(0, 50),
    high_error_questions: highErrorQuestions.slice(0, 30),
  }
}

export async function filterQuestionIdsByStats(filters = {}) {
  const admin = getSupabaseAdmin()
  let query = admin.from(TABLE).select('question_id')
  if (filters.min_error_rate != null && filters.min_error_rate !== '') {
    query = query.gte('error_rate', Number(filters.min_error_rate))
  }
  if (filters.max_error_rate != null && filters.max_error_rate !== '') {
    query = query.lte('error_rate', Number(filters.max_error_rate))
  }
  if (filters.min_avg_score_rate != null && filters.min_avg_score_rate !== '') {
    query = query.gte('avg_score_rate', Number(filters.min_avg_score_rate))
  }
  if (filters.max_avg_score_rate != null && filters.max_avg_score_rate !== '') {
    query = query.lte('avg_score_rate', Number(filters.max_avg_score_rate))
  }
  if (filters.min_attempts != null && filters.min_attempts !== '') {
    query = query.gte('total_attempts', Number(filters.min_attempts))
  }
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []).map((r) => r.question_id)
}
