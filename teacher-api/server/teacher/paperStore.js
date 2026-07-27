/**
 * 试题试卷资源 — 数据访问与 Storage 上传
 */
import { getSupabaseAdmin, ensurePaperBucket, uploadPaperFile, getPaperMaxBytes } from '../supabaseAdmin.js'

const PAPER_TABLE = 'paper'
const CATEGORY_TABLE = 'paper_category'
const COLLECTION_TABLE = 'paper_collection'

const MAX_FILE_BYTES = getPaperMaxBytes()

const GAO_KAO_CATEGORY = '高考复习'
const JUNIOR_GRADES = ['七年级', '八年级', '九年级']
const VALID_SUBJECTS = ['语文', '数学', '英语', '物理', '化学', '生物', '历史', '地理']

function isJuniorGrade(grade) {
  return JUNIOR_GRADES.includes(grade)
}

function nowIso() {
  return new Date().toISOString()
}

function extFromName(name = '') {
  const m = String(name).match(/\.([a-z0-9]+)$/i)
  return m ? m[1].toLowerCase() : 'pdf'
}

function mimeFromExt(ext) {
  const map = {
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    zip: 'application/zip',
    rar: 'application/x-rar-compressed',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
  }
  return map[ext] || 'application/octet-stream'
}

export async function listCategories(filters = {}) {
  const admin = getSupabaseAdmin()
  const { data, error } = await admin.from(CATEGORY_TABLE).select('*').order('sort')
  if (error) throw new Error(error.message)
  const rows = data ?? []
  let roots = rows.filter((r) => !r.parent_id)
  if (isJuniorGrade(filters.grade)) {
    roots = roots.filter((r) => r.category_name !== GAO_KAO_CATEGORY)
  }
  return roots.map((root) => ({
    ...root,
    children: rows.filter((r) => r.parent_id === root.id).sort((a, b) => a.sort - b.sort),
  }))
}

async function getGaokaoCategoryIds(admin) {
  const { data } = await admin.from(CATEGORY_TABLE).select('id, parent_id, category_name')
  const gaokao = (data ?? []).find((r) => r.category_name === GAO_KAO_CATEGORY && !r.parent_id)
  if (!gaokao) return []
  const childIds = (data ?? []).filter((r) => r.parent_id === gaokao.id).map((r) => r.id)
  return [gaokao.id, ...childIds]
}

function buildSearchText(row) {
  return [row.title, row.subject, row.grade, row.area, row.level, ...(row.tags || [])]
    .filter(Boolean)
    .join(' ')
}

export async function listPapers(userId, filters = {}) {
  const admin = getSupabaseAdmin()
  const page = Math.max(1, Number(filters.page) || 1)
  const pageSize = Math.min(50, Math.max(1, Number(filters.pageSize) || 10))
  const sort = filters.sort || 'latest'

  let query = admin.from(PAPER_TABLE).select('*', { count: 'exact' })

  if (filters.visibility !== 'all') {
    query = query.eq('visibility', 'public')
  }
  if (filters.grade && filters.grade !== '不限') query = query.eq('grade', filters.grade)
  if (filters.exam_year && filters.exam_year !== '不限') {
    query = query.eq('exam_year', Number(filters.exam_year))
  }
  if (filters.area && filters.area !== '不限') query = query.ilike('area', `%${filters.area}%`)
  if (filters.level && filters.level !== '不限') query = query.eq('level', filters.level)
  if (filters.category_id) query = query.eq('category_id', filters.category_id)
  if (filters.set_type) query = query.eq('set_type', filters.set_type)
  if (filters.has_answer === 'true' || filters.has_answer === true) query = query.eq('has_answer', true)
  if (filters.has_analysis === 'true' || filters.has_analysis === true) query = query.eq('has_analysis', true)
  if (filters.subject && filters.subject !== '不限') query = query.eq('subject', filters.subject)
  if (filters.keyword) query = query.ilike('search_text', `%${filters.keyword}%`)
  if (filters.file_type && filters.file_type !== '不限') query = query.eq('file_type', filters.file_type)

  if (isJuniorGrade(filters.grade)) {
    const gaokaoIds = await getGaokaoCategoryIds(admin)
    if (gaokaoIds.length) query = query.not('category_id', 'in', `(${gaokaoIds.join(',')})`)
  }

  if (filters.my_uploads === 'true' && userId) {
    query = query.eq('upload_user_id', userId)
  }

  if (sort === 'views') query = query.order('view_count', { ascending: false })
  else if (sort === 'downloads') query = query.order('download_count', { ascending: false })
  else query = query.order('created_at', { ascending: false })

  const from = (page - 1) * pageSize
  query = query.range(from, from + pageSize - 1)

  const { data, error, count } = await query
  if (error) throw new Error(error.message)

  let collectedIds = new Set()
  if (userId && data?.length) {
    const { data: cols } = await admin
      .from(COLLECTION_TABLE)
      .select('paper_id')
      .eq('user_id', userId)
      .in('paper_id', data.map((p) => p.id))
    collectedIds = new Set((cols ?? []).map((c) => c.paper_id))
  }

  const items = (data ?? []).map((p) => ({
    ...p,
    collected: collectedIds.has(p.id),
  }))

  return { items, total: count ?? 0, page, pageSize }
}

export async function getPaperById(id, userId) {
  const admin = getSupabaseAdmin()
  const { data, error } = await admin.from(PAPER_TABLE).select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null
  if (data.visibility !== 'public' && data.upload_user_id !== userId) return null

  let collected = false
  if (userId) {
    const { data: col } = await admin
      .from(COLLECTION_TABLE)
      .select('id')
      .eq('user_id', userId)
      .eq('paper_id', id)
      .maybeSingle()
    collected = Boolean(col)
  }
  return { ...data, collected }
}

export async function createPaper(userId, payload, fileBase64, fileName) {
  if (!fileBase64 || !fileName) throw new Error('请上传试卷文件')
  const buffer = Buffer.from(fileBase64, 'base64')
  if (buffer.length > MAX_FILE_BYTES) throw new Error(`文件超过 ${Math.floor(MAX_FILE_BYTES / 1024 / 1024)}MB 限制`)
  if (buffer.length < 10) throw new Error('文件无效或为空')

  const ext = extFromName(fileName)
  const dup = await checkDuplicate(userId, payload.title, buffer.length)
  if (dup) throw new Error('检测到可能重复的文件（同名同大小）')

  await ensurePaperBucket()
  const fileUrl = await uploadPaperFile(userId, fileName, buffer, mimeFromExt(ext))

  const admin = getSupabaseAdmin()
  const row = {
    title: String(payload.title || fileName).trim(),
    subject: payload.subject && VALID_SUBJECTS.includes(payload.subject) ? payload.subject : '数学',
    grade: payload.grade || '',
    term: payload.term || '无',
    exam_year: payload.exam_year ? Number(payload.exam_year) : new Date().getFullYear(),
    area: payload.area || '全国',
    category_id: payload.category_id || null,
    level: payload.level || '普通',
    has_answer: Boolean(payload.has_answer),
    has_analysis: Boolean(payload.has_analysis),
    file_url: fileUrl,
    file_type: ext,
    file_size: buffer.length,
    page_count: Number(payload.page_count) || 0,
    set_type: payload.set_type || 'single',
    upload_user_id: userId,
    visibility: payload.visibility || 'public',
    tags: Array.isArray(payload.tags) ? payload.tags : [],
    search_text: '',
    created_at: nowIso(),
    updated_at: nowIso(),
  }
  row.search_text = buildSearchText(row)

  const { data, error } = await admin.from(PAPER_TABLE).insert(row).select('*').single()
  if (error) throw new Error(error.message)
  return data
}

async function checkDuplicate(userId, title, size) {
  const admin = getSupabaseAdmin()
  const { data } = await admin
    .from(PAPER_TABLE)
    .select('id')
    .eq('upload_user_id', userId)
    .eq('title', String(title).trim())
    .eq('file_size', size)
    .limit(1)
  return (data ?? []).length > 0
}

export async function updatePaper(userId, id, payload) {
  const admin = getSupabaseAdmin()
  const existing = await getPaperById(id, userId)
  if (!existing || existing.upload_user_id !== userId) throw new Error('无权编辑此试卷')

  const patch = {
    title: payload.title ?? existing.title,
    subject: payload.subject ?? existing.subject,
    grade: payload.grade ?? existing.grade,
    term: payload.term ?? existing.term,
    exam_year: payload.exam_year ?? existing.exam_year,
    area: payload.area ?? existing.area,
    category_id: payload.category_id ?? existing.category_id,
    level: payload.level ?? existing.level,
    has_answer: payload.has_answer ?? existing.has_answer,
    has_analysis: payload.has_analysis ?? existing.has_analysis,
    page_count: payload.page_count ?? existing.page_count,
    set_type: payload.set_type ?? existing.set_type,
    visibility: payload.visibility ?? existing.visibility,
    tags: payload.tags ?? existing.tags,
    updated_at: nowIso(),
  }
  patch.search_text = buildSearchText({ ...existing, ...patch })

  const { data, error } = await admin.from(PAPER_TABLE).update(patch).eq('id', id).select('*').single()
  if (error) throw new Error(error.message)
  return data
}

export async function deletePaper(userId, id) {
  const admin = getSupabaseAdmin()
  const existing = await getPaperById(id, userId)
  if (!existing || existing.upload_user_id !== userId) throw new Error('无权删除此试卷')
  const { error } = await admin.from(PAPER_TABLE).delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export async function batchDeletePapers(userId, ids = []) {
  for (const id of ids) {
    await deletePaper(userId, id)
  }
}

export async function incrementView(id) {
  const admin = getSupabaseAdmin()
  const { data } = await admin.from(PAPER_TABLE).select('view_count').eq('id', id).single()
  if (data) {
    await admin.from(PAPER_TABLE).update({ view_count: (data.view_count || 0) + 1 }).eq('id', id)
  }
}

export async function incrementDownload(id) {
  const admin = getSupabaseAdmin()
  const { data } = await admin.from(PAPER_TABLE).select('download_count').eq('id', id).single()
  if (data) {
    await admin.from(PAPER_TABLE).update({ download_count: (data.download_count || 0) + 1 }).eq('id', id)
  }
}

export async function toggleCollection(userId, paperId, collect) {
  const admin = getSupabaseAdmin()
  if (collect) {
    const { error } = await admin.from(COLLECTION_TABLE).upsert({
      user_id: userId,
      paper_id: paperId,
      collect_time: nowIso(),
    }, { onConflict: 'user_id,paper_id' })
    if (error) throw new Error(error.message)
  } else {
    const { error } = await admin.from(COLLECTION_TABLE).delete().eq('user_id', userId).eq('paper_id', paperId)
    if (error) throw new Error(error.message)
  }
}

export async function listCollection(userId) {
  const admin = getSupabaseAdmin()
  const { data, error } = await admin
    .from(COLLECTION_TABLE)
    .select('paper_id, collect_time, paper:paper(*)')
    .eq('user_id', userId)
    .order('collect_time', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []).map((r) => ({ ...r.paper, collect_time: r.collect_time }))
}
