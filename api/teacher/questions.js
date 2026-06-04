/**
 * 显式路由：/api/teacher/questions
 * Vercel 在存在 api/teacher/questions/ 子目录时，catch-all [...path].js 不会匹配本路径，导致回退 SPA。
 * 修复：不导入 apiResponse.js（会触发 deepseekClient.js 依赖链导致 FUNCTION_INVOCATION_FAILED），
 *       直接内联必需的 header 函数。
 */
import '../../server/applyUrlShim.js'
import { getSupabaseAdmin, isSupabaseAdminConfigured } from '../../server/supabaseAdmin.js'

const TABLE = 'teacher_question_bank'

function nowIso() { return new Date().toISOString() }

function setCorsHeaders(req, res) {
  const origin = req.headers.origin || '*'
  res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Access-Control-Allow-Credentials', 'true')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With')
}

function handleOptions(req, res) {
  if (req.method === 'OPTIONS') {
    setCorsHeaders(req, res)
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
    res.status(204).end()
    return true
  }
  return false
}

export default async function handler(req, res) {
  if (handleOptions(req, res)) return
  setCorsHeaders(req, res)
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
  res.setHeader('Pragma', 'no-cache')
  res.setHeader('Expires', '0')

  const method = req.method
  const body = req.body ?? {}
  const query = req.query ?? {}

  if (!isSupabaseAdminConfigured()) {
    return res.status(503).json({ success: false, message: '请配置 SUPABASE_URL 与 SUPABASE_SERVICE_ROLE_KEY' })
  }

  try {
    if (method === 'GET') {
      const teacherId = query.teacherId
      if (!teacherId) return res.status(400).json({ success: false, message: '缺少 teacherId' })

      const supabase = getSupabaseAdmin()
      const { page = 1, pageSize = 20, subject, questionType, difficulty, source, keyword, topic } = query

      let sbQuery = supabase
        .from(TABLE)
        .select('*', { count: 'exact' })
        .eq('teacher_id', teacherId)
        .order('created_at', { ascending: false })

      if (subject) sbQuery = sbQuery.eq('subject', subject)
      if (questionType) sbQuery = sbQuery.eq('question_type', questionType)
      if (difficulty) sbQuery = sbQuery.eq('difficulty', difficulty)
      if (source) sbQuery = sbQuery.eq('source', source)
      if (topic) sbQuery = sbQuery.eq('topic', topic)
      if (keyword) sbQuery = sbQuery.ilike('content', `%${keyword}%`)

      const fromIdx = (Number(page) - 1) * Number(pageSize)
      const toIdx = fromIdx + Number(pageSize) - 1
      sbQuery = sbQuery.range(fromIdx, toIdx)

      const { data, error, count } = await sbQuery
      if (error) throw error

      return res.status(200).json({ success: true, items: data ?? [], total: count ?? 0, page: Number(page), pageSize: Number(pageSize) })
    }

    if (method === 'POST') {
      const teacherId = body?.teacherId?.trim() || query?.teacherId?.trim()
      if (!teacherId) return res.status(400).json({ success: false, message: '缺少 teacherId' })

      const supabase = getSupabaseAdmin()
      const { data, error } = await supabase.from(TABLE).insert({ ...body, teacher_id: teacherId, created_at: nowIso() }).select().single()
      if (error) throw error

      return res.status(200).json({ success: true, question: data })
    }

    if (method === 'DELETE') {
      const teacherId = body?.teacherId?.trim() || query?.teacherId?.trim()
      if (!teacherId) return res.status(400).json({ success: false, message: '缺少 teacherId' })

      const supabase = getSupabaseAdmin()
      const ids = body.ids ?? []
      if (!ids.length) return res.status(400).json({ success: false, message: '缺少 ids' })

      const { error } = await supabase.from(TABLE).delete().in('id', ids).eq('teacher_id', teacherId)
      if (error) throw error

      return res.status(200).json({ success: true })
    }

    return res.status(405).json({ success: false, message: `不支持的 HTTP 方法: ${method}` })
  } catch (error) {
    console.error('[api/teacher/questions] 错误', error)
    return res.status(500).json({ success: false, message: error instanceof Error ? error.message : '服务器错误' })
  }
}

export const config = {
  maxDuration: 60,
  api: { bodyParser: { sizeLimit: '50mb' } },
}
