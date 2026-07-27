import { getSupabaseAdmin, isSupabaseAdminConfigured } from '../supabaseAdmin.js'
import { normalizeQuestionPayload } from '../knowledge/knowledgePointIds.js'
import { archiveQuestionVersion, listQuestionVersions, restoreQuestionVersion } from './questionVersionStore.js'
import { getStatsForQuestions } from './questionStatsStore.js'
import { filterQuestionIdsByStats } from './questionStatsStore.js'
import { buildQuestionSearchText, escapeIlikePattern } from './questionSearch.js'
import {
  enrichTopicFields,
  buildGroupedTopicStats,
  questionMatchesTopicFilter,
  hasTopicTaxonomy,
  batchEnrichQuestions,
} from './topicTaxonomy/index.js'

const enrichQuestionTopic = enrichTopicFields

const TABLE = 'teacher_question_bank'

export { isSupabaseAdminConfigured, listQuestionVersions, restoreQuestionVersion }

function nowIso() {
  return new Date().toISOString()
}

/** 专题筛选：与侧栏统计相同的解析逻辑 */
async function filterQuestionIdsByTopic(teacherId, filters, visibility) {
  const admin = getSupabaseAdmin()
  const useResolved = Boolean(filters.subject && hasTopicTaxonomy(filters.grade, filters.subject))
  const selectCols = useResolved
    ? 'id, topic_group, topic_tag, grade, knowledge_point, tags, content, analysis, subject'
    : 'id, topic_group, topic_tag'

  let query = admin.from(TABLE).select(selectCols)
  if (visibility === 'public') {
    query = query.eq('visibility', 'public')
  } else {
    query = query.eq('teacher_id', teacherId)
  }
  if (filters.subject) query = query.eq('subject', filters.subject)
  if (filters.grade) query = query.eq('grade', filters.grade)

  let { data, error } = await query
  if (error && useResolved && /topic_group|topic_tag|column/.test(error.message)) {
    let fallbackQuery = admin.from(TABLE).select('id, grade, knowledge_point, tags, content, analysis, subject')
    if (visibility === 'public') {
      fallbackQuery = fallbackQuery.eq('visibility', 'public')
    } else {
      fallbackQuery = fallbackQuery.eq('teacher_id', teacherId)
    }
    if (filters.subject) fallbackQuery = fallbackQuery.eq('subject', filters.subject)
    if (filters.grade) fallbackQuery = fallbackQuery.eq('grade', filters.grade)
    const fallback = await fallbackQuery
    if (fallback.error) throw new Error(fallback.error.message)
    data = fallback.data
  } else if (error) {
    throw new Error(error.message)
  }

  return (data ?? []).filter((row) => {
    if (useResolved) return questionMatchesTopicFilter(row, filters)
    if (filters.topic_tag && row.topic_tag !== filters.topic_tag) return false
    if (filters.topic_group && row.topic_group !== filters.topic_group) return false
    return true
  }).map((r) => r.id)
}

export async function listQuestions(teacherId, filters = {}) {
  const admin = getSupabaseAdmin()
  const page = Math.max(1, Number(filters.page) || 1)
  const pageSize = Math.min(50, Math.max(1, Number(filters.pageSize) || 10))
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  const visibility = filters.visibility || 'personal'

  const hasStatsFilter = ['min_error_rate', 'max_error_rate', 'min_avg_score_rate', 'max_avg_score_rate', 'min_attempts']
    .some((k) => filters[k] != null && filters[k] !== '')
  let statsQuestionIds = null
  if (hasStatsFilter) {
    statsQuestionIds = await filterQuestionIdsByStats(filters)
    if (!statsQuestionIds.length) {
      return { items: [], total: 0, page, pageSize, visibility, highlight: filters.keyword || '' }
    }
  }

  let topicQuestionIds = null
  if (filters.topic_tag || filters.topic_group) {
    topicQuestionIds = await filterQuestionIdsByTopic(teacherId, filters, visibility)
    if (!topicQuestionIds.length) {
      return { items: [], total: 0, page, pageSize, visibility, highlight: filters.keyword || '' }
    }
  }

  let query = admin
    .from(TABLE)
    .select('*', { count: 'exact' })
    .order('updated_at', { ascending: false })
    .range(from, to)

  if (visibility === 'public') {
    query = query.eq('visibility', 'public')
  } else {
    query = query.eq('teacher_id', teacherId)
  }

  if (statsQuestionIds) query = query.in('id', statsQuestionIds)
  if (topicQuestionIds) query = query.in('id', topicQuestionIds)

  if (filters.subject) query = query.eq('subject', filters.subject)
  if (filters.grade) query = query.eq('grade', filters.grade)
  if (filters.question_type) query = query.eq('question_type', filters.question_type)
  if (filters.difficulty) query = query.eq('difficulty', filters.difficulty)
  if (filters.source) query = query.eq('source', filters.source)
  if (filters.textbook_version) query = query.eq('textbook_version', filters.textbook_version)
  if (filters.ability_dimension) query = query.eq('ability_dimension', filters.ability_dimension)
  if (filters.suitable_stage) query = query.eq('suitable_stage', filters.suitable_stage)
  if (filters.knowledge_point) query = query.ilike('knowledge_point', `%${filters.knowledge_point}%`)
  if (!topicQuestionIds) {
    if (filters.topic_tag) query = query.eq('topic_tag', filters.topic_tag)
    if (filters.topic_group) query = query.eq('topic_group', filters.topic_group)
  }
  if (filters.knowledge_point_id) {
    query = query.contains('knowledge_point_ids', [filters.knowledge_point_id])
  }
  if (filters.min_estimated_time != null && filters.min_estimated_time !== '') {
    query = query.gte('estimated_time', Number(filters.min_estimated_time))
  }
  if (filters.max_estimated_time != null && filters.max_estimated_time !== '') {
    query = query.lte('estimated_time', Number(filters.max_estimated_time))
  }
  if (filters.keyword) {
    const kw = escapeIlikePattern(filters.keyword)
    query = query.ilike('search_text', `%${kw}%`)
  }

  const { data, error, count } = await query
  if (error) throw new Error(error.message)

  const ids = (data ?? []).map((q) => q.id).filter(Boolean)
  const statsMap = await getStatsForQuestions(ids)
  const items = (data ?? []).map((q) => ({
    ...q,
    stats: statsMap[q.id] ?? null,
  }))

  return { items, total: count ?? 0, page, pageSize, visibility, highlight: filters.keyword || '' }
}

export async function getQuestion(teacherId, id) {
  const admin = getSupabaseAdmin()
  // 公域题目所有人可读
  const { data, error } = await admin.from(TABLE).select('*').eq('id', id).or(`teacher_id.eq.${teacherId},visibility.eq.public`).maybeSingle()
  if (error) throw new Error(error.message)
  return data
}

function rowFromNormalized(teacherId, normalized, defaults = {}) {
  const enriched = enrichQuestionTopic(normalized)
  return {
    teacher_id: teacherId,
    subject: enriched.subject,
    grade: enriched.grade,
    knowledge_point: enriched.knowledge_point || '',
    knowledge_point_ids: enriched.knowledge_point_ids ?? [],
    question_type: enriched.question_type,
    difficulty: enriched.difficulty || '中等',
    content: enriched.content,
    options: enriched.options ?? [],
    answer: enriched.answer || '',
    analysis: enriched.analysis || '',
    source: enriched.source || defaults.source || '手动录入',
    textbook_version: enriched.textbook_version || '',
    ability_dimension: enriched.ability_dimension || '',
    suitable_stage: enriched.suitable_stage || '',
    estimated_time: enriched.estimated_time,
    topic_group: enriched.topic_group || '',
    topic_tag: enriched.topic_tag || '',
    latex_blocks: Array.isArray(enriched.latex_blocks) ? enriched.latex_blocks : [],
    search_text: buildQuestionSearchText(enriched),
    tags: enriched.tags ?? [],
    visibility: enriched.visibility || 'personal',
    updated_at: nowIso(),
  }
}

export async function createQuestion(teacherId, payload) {
  const admin = getSupabaseAdmin()
  const normalized = normalizeQuestionPayload(payload)
  const row = rowFromNormalized(teacherId, normalized)
  const { data, error } = await admin.from(TABLE).insert(row).select('*').single()
  if (error) throw new Error(error.message)
  return data
}

export async function createQuestionsBatch(teacherId, questions) {
  const { sanitizeQuestionsForStorage } = await import('../batch/questionContentSanitizer.js')
  const cleaned = await sanitizeQuestionsForStorage(questions)
  const { items: enrichedList, matched, fallback, total } = batchEnrichQuestions(
    cleaned.map((q) => normalizeQuestionPayload(q)),
  )
  const rows = enrichedList.map((q) => rowFromNormalized(teacherId, q, { source: '试卷导入' }))
  const admin = getSupabaseAdmin()
  const { data, error } = await admin.from(TABLE).insert(rows).select('*')
  if (error) throw new Error(error.message)
  return {
    items: data ?? [],
    topicTagging: { matched, fallback, total },
  }
}

export async function updateQuestion(teacherId, id, payload) {
  const admin = getSupabaseAdmin()
  const { data: existing, error: fetchErr } = await admin
    .from(TABLE)
    .select('content, answer, analysis')
    .eq('id', id)
    .eq('teacher_id', teacherId)
    .maybeSingle()
  if (fetchErr) throw new Error(fetchErr.message)
  if (!existing) throw new Error('题目不存在或无权访问')

  await archiveQuestionVersion(admin, id, teacherId, existing)

  const normalized = normalizeQuestionPayload(payload)
  const enriched = enrichQuestionTopic(normalized)
  const row = {
    subject: enriched.subject,
    grade: enriched.grade,
    knowledge_point: enriched.knowledge_point || '',
    knowledge_point_ids: enriched.knowledge_point_ids ?? [],
    question_type: enriched.question_type,
    difficulty: enriched.difficulty || '中等',
    content: enriched.content,
    options: enriched.options ?? [],
    answer: enriched.answer || '',
    analysis: enriched.analysis || '',
    source: enriched.source || '手动录入',
    textbook_version: enriched.textbook_version || '',
    ability_dimension: enriched.ability_dimension || '',
    suitable_stage: enriched.suitable_stage || '',
    estimated_time: enriched.estimated_time,
    topic_group: enriched.topic_group || '',
    topic_tag: enriched.topic_tag || '',
    latex_blocks: Array.isArray(enriched.latex_blocks) ? enriched.latex_blocks : [],
    search_text: buildQuestionSearchText(enriched),
    tags: enriched.tags ?? [],
    visibility: enriched.visibility,
    updated_at: nowIso(),
  }
  const { data, error } = await admin
    .from(TABLE)
    .update(row)
    .eq('id', id)
    .eq('teacher_id', teacherId)
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return data
}

export async function fetchQuestionVersions(teacherId, questionId) {
  return listQuestionVersions(getSupabaseAdmin(), teacherId, questionId)
}

export async function restoreQuestionToVersion(teacherId, questionId, versionId) {
  return restoreQuestionVersion(getSupabaseAdmin(), teacherId, questionId, versionId)
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

export async function listTopics(teacherId, subject, grade = '') {
  if (subject && hasTopicTaxonomy(grade, subject)) {
    const admin = getSupabaseAdmin()
    let query = admin
      .from(TABLE)
      .select('topic_group, topic_tag, grade, knowledge_point, tags, content, analysis, subject')
      .eq('teacher_id', teacherId)
      .eq('subject', subject)
    if (grade) query = query.eq('grade', grade)

    let rows = []
    const { data, error } = await query

    if (error && /topic_group|topic_tag|column/.test(error.message)) {
      let fallback = admin
        .from(TABLE)
        .select('grade, knowledge_point, tags, content, analysis, subject')
        .eq('teacher_id', teacherId)
        .eq('subject', subject)
      if (grade) fallback = fallback.eq('grade', grade)
      const fb = await fallback
      if (fb.error) throw new Error(fb.error.message)
      rows = fb.data ?? []
    } else if (error) {
      throw new Error(error.message)
    } else {
      rows = data ?? []
    }

    const groups = buildGroupedTopicStats(rows, grade, subject)
    return {
      grouped: true,
      subject,
      grade: grade || undefined,
      groups,
      total: rows.length,
    }
  }

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
  return { grouped: false, topics: result }
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
