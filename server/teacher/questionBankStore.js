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

  const visibility = filters.visibility || 'personal'

  let query = admin
    .from(TABLE)
    .select('*', { count: 'exact' })
    .order('updated_at', { ascending: false })
    .range(from, to)

  // 可见性过滤
  if (visibility === 'public') {
    query = query.eq('visibility', 'public')
  } else {
    query = query.eq('teacher_id', teacherId)
  }

  if (filters.subject) query = query.eq('subject', filters.subject)
  if (filters.grade) query = query.eq('grade', filters.grade)
  if (filters.question_type) query = query.eq('question_type', filters.question_type)
  if (filters.difficulty) query = query.eq('difficulty', filters.difficulty)
  if (filters.source) query = query.eq('source', filters.source)
  if (filters.knowledge_point) query = query.ilike('knowledge_point', `%${filters.knowledge_point}%`)
  if (filters.keyword) query = query.ilike('content', `%${filters.keyword}%`)

  const { data, error, count } = await query
  if (error) throw new Error(error.message)
  return { items: data ?? [], total: count ?? 0, page, pageSize, visibility }
}

export async function getQuestion(teacherId, id) {
  const admin = getSupabaseAdmin()
  // 公域题目所有人可读
  const { data, error } = await admin.from(TABLE).select('*').eq('id', id).or(`teacher_id.eq.${teacherId},visibility.eq.public`).maybeSingle()
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
    visibility: payload.visibility || 'personal',
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
    visibility: q.visibility || 'personal',
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
  // 组卷：个人题库 + 公域题库
  let query = admin.from(TABLE).select('*')
    .or(`teacher_id.eq.${teacherId},visibility.eq.public`)
  if (criteria.subject) query = query.eq('subject', criteria.subject)
  if (criteria.grade) query = query.eq('grade', criteria.grade)
  const { data, error } = await query.limit(500)
  if (error) throw new Error(error.message)
  return data ?? []
}

/** 批量修改题目可见性 */
export async function updateQuestionsVisibility(teacherId, ids, visibility) {
  const admin = getSupabaseAdmin()
  const { error } = await admin
    .from(TABLE)
    .update({ visibility, updated_at: nowIso() })
    .eq('teacher_id', teacherId)
    .in('id', ids)
  if (error) throw new Error(error.message)
}

// ===== 学科/专题汇聚 =====

const TOPIC_KEYWORDS_BY_SUBJECT = {
  '数学': ['函数', '几何', '代数', '概率', '统计', '三角函数', '数列', '向量', '导数', '积分', '集合', '逻辑', '不等式', '复数', '立体几何', '解析几何', '排列组合'],
  '物理': ['力学', '电学', '热学', '光学', '声学', '原子物理', '电磁学', '近代物理', '波', '能量', '动量'],
  '化学': ['无机化学', '有机化学', '物理化学', '分析化学', '电化学', '反应原理', '元素化合物', '化学平衡', '溶液', '氧化还原'],
  '语文': ['现代文阅读', '古诗文阅读', '写作', '语言文字运用', '名著导读', '口语交际', '综合性学习'],
  '英语': ['语法', '词汇', '阅读', '写作', '听力', '完形填空', '书面表达', '七选五', '短文改错'],
  '生物': ['细胞', '遗传', '进化', '生态', '人体生理', '植物生理', '微生物', '生物技术', '生物工程'],
  '历史': ['中国古代史', '中国近现代史', '世界史', '政治史', '经济史', '文化史', '战争与和平'],
  '地理': ['自然地理', '人文地理', '区域地理', '地图', '气候', '地貌', '水文', '人口', '城市', '农业', '工业', '交通'],
}

function extractTopicFromKnowledgePoint(kp, subject) {
  if (!kp) return '未分类'
  if (kp.includes('/')) return kp.split('/')[0].trim()
  const dashMatch = kp.split(/——|-/)
  if (dashMatch.length > 1) return dashMatch[0].trim()
  const keywords = TOPIC_KEYWORDS_BY_SUBJECT[subject] || []
  for (const kw of keywords) {
    if (kp.includes(kw)) return kw
  }
  return kp.trim()
}

export async function listTopics(teacherId, subject) {
  const admin = getSupabaseAdmin()
  let query = admin.from(TABLE).select('knowledge_point,subject').eq('teacher_id', teacherId)
  if (subject) query = query.eq('subject', subject)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  const topicSet = new Map()
  for (const row of data ?? []) {
    const kp = row.knowledge_point || ''
    const subj = row.subject || '未分类'
    const topic = extractTopicFromKnowledgePoint(kp, subj)
    if (!topic) continue
    const existing = topicSet.get(topic)
    if (existing) {
      topicSet.set(topic, { subject: existing.subject, count: existing.count + 1 })
    } else {
      topicSet.set(topic, { subject: subj, count: 1 })
    }
  }
  const result = {}
  for (const [topic, { subject: subj, count }] of topicSet.entries()) {
    if (!result[subj]) result[subj] = []
    result[subj].push({ topic, count })
  }
  for (const key of Object.keys(result)) {
    result[key].sort((a, b) => b.count - a.count)
  }
  return result
}

export async function getQuestionStats(teacherId) {
  const admin = getSupabaseAdmin()
  const { data, error } = await admin
    .from(TABLE)
    .select('subject,knowledge_point')
    .eq('teacher_id', teacherId)
  if (error) throw new Error(error.message)
  const subjectCounts = {}
  const topicCounts = {}
  for (const row of data ?? []) {
    const subj = row.subject || '未分类'
    subjectCounts[subj] = (subjectCounts[subj] || 0) + 1
    const topic = extractTopicFromKnowledgePoint(row.knowledge_point || '', subj)
    if (!topicCounts[subj]) topicCounts[subj] = {}
    topicCounts[subj][topic] = (topicCounts[subj][topic] || 0) + 1
  }
  return { subjectCounts, topicCounts }
}
