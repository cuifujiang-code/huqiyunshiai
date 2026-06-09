/**
 * 高考志愿填报 API
 *
 * POST /api/volunteer/generate     — 生成方案并入库
 * GET  /api/volunteer/schemes      — 用户方案列表
 * GET  /api/volunteer/scheme/:id   — 方案详情
 * PUT  /api/volunteer/scheme/:id   — 更新方案
 */

import { createServiceRoleClient } from '../supabaseAdmin.js'
import { generateVolunteerRecommendations } from '../volunteerEngine.js'

function getSupabase() {
  return createServiceRoleClient()
}

async function getBody(req) {
  if (req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0) return req.body
  return new Promise((resolve) => {
    let raw = ''
    req.on('data', (chunk) => { raw += chunk })
    req.on('end', () => { try { resolve(JSON.parse(raw)) } catch { resolve({}) } })
  })
}

function json(res, data, status = 200) {
  res.status(status).json(data)
}

function setCors(req, res) {
  const origin = req.headers?.origin || '*'
  res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-supabase-auth')
  res.setHeader('Access-Control-Allow-Credentials', 'true')
}

function getPathname(req) {
  try {
    const host = req.headers?.host || 'localhost'
    const proto = req.headers?.['x-forwarded-proto'] === 'https' ? 'https' : 'http'
    return new URL(req.url, `${proto}://${host}`).pathname
  } catch {
    return (req.url || '').split('?')[0]
  }
}

function mapItemRow(row) {
  return {
    itemId: row.item_id,
    sortOrder: row.sort_order,
    tierLabel: row.tier_label,
    gradientLevel: row.gradient_level,
    collegeName: row.college_name,
    majorName: row.major_name,
    admissionDataId: row.admission_data_id,
    predictedRank: row.predicted_rank,
    predictedMinRank: row.predicted_min_rank,
    probability: row.probability,
    rankRatio: row.rank_ratio,
    minScore: row.min_score,
    avgScore: row.avg_score,
    minRank: row.min_rank,
    subjectRequirement: row.subject_requirement,
    isManual: row.is_manual,
    extJson: row.ext_json,
  }
}

function mapSchemeRow(row) {
  return {
    schemeId: row.scheme_id,
    userId: row.user_id,
    schemeName: row.scheme_name,
    province: row.province,
    subjectType: row.subject_type,
    subjects: row.subjects,
    score: row.score,
    rank: row.rank,
    intendedMajors: row.intended_majors,
    batchType: row.batch_type,
    inputExt: row.input_ext,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

async function fetchAdmissionData(supabase, input) {
  const { data, error } = await supabase
    .from('college_admission_data')
    .select('*')
    .eq('province', input.province)
    .eq('subject_type', input.subjectType)
    .eq('batch_type', input.batchType || '本科')
    .order('year', { ascending: false })

  if (error) throw new Error(error.message)
  return data || []
}

async function postGenerate(req, res) {
  setCors(req, res)
  const body = await getBody(req)
  const {
    userId,
    province,
    subjectType,
    subjects = [],
    score,
    rank,
    intendedMajors = [],
    batchType = '本科',
    schemeName,
    inputExt = {},
  } = body

  if (!userId?.trim()) return json(res, { success: false, message: '缺少 userId' }, 400)
  if (!province?.trim()) return json(res, { success: false, message: '缺少 province' }, 400)
  if (!subjectType?.trim()) return json(res, { success: false, message: '缺少 subjectType' }, 400)
  if (!rank || rank <= 0) return json(res, { success: false, message: '请提供有效位次 rank' }, 400)

  try {
    const supabase = getSupabase()
    const admissionRows = await fetchAdmissionData(supabase, { province, subjectType, batchType })

    const recommendations = generateVolunteerRecommendations(admissionRows, {
      province,
      subjectType,
      subjects,
      batchType,
      intendedMajors,
      rank: Number(rank),
      inputExt,
    })

    const name =
      schemeName?.trim() ||
      `${province}${subjectType}志愿方案 ${new Date().toLocaleDateString('zh-CN')}`

    const { data: scheme, error: schemeErr } = await supabase
      .from('volunteer_schemes')
      .insert({
        user_id: userId.trim(),
        scheme_name: name,
        province: province.trim(),
        subject_type: subjectType.trim(),
        subjects,
        score: score ?? null,
        rank: Number(rank),
        intended_majors: intendedMajors,
        batch_type: batchType,
        input_ext: inputExt,
        status: 'draft',
      })
      .select()
      .single()

    if (schemeErr) return json(res, { success: false, message: schemeErr.message }, 500)

    const itemRows = recommendations.map((item) => ({
      scheme_id: scheme.scheme_id,
      sort_order: item.sortOrder,
      tier_label: item.tierLabel,
      gradient_level: item.gradientLevel,
      college_name: item.collegeName,
      major_name: item.majorName,
      admission_data_id: item.admissionDataId,
      predicted_rank: item.predictedRank,
      predicted_min_rank: item.predictedMinRank,
      probability: item.probability,
      rank_ratio: item.rankRatio,
      min_score: item.minScore,
      avg_score: item.avgScore,
      min_rank: item.minRank,
      subject_requirement: item.subjectRequirement,
      is_manual: false,
      ext_json: item.extJson || {},
    }))

    if (itemRows.length > 0) {
      const { error: itemsErr } = await supabase.from('volunteer_items').insert(itemRows)
      if (itemsErr) return json(res, { success: false, message: itemsErr.message }, 500)
    }

    const { data: items } = await supabase
      .from('volunteer_items')
      .select('*')
      .eq('scheme_id', scheme.scheme_id)
      .order('sort_order')

    return json(res, {
      success: true,
      scheme: mapSchemeRow(scheme),
      items: (items || []).map(mapItemRow),
      summary: {
        total: recommendations.length,
        rush: recommendations.filter((i) => i.tierLabel === '冲').length,
        stable: recommendations.filter((i) => i.tierLabel === '稳').length,
        safe: recommendations.filter((i) => i.tierLabel === '保').length,
      },
    })
  } catch (err) {
    return json(res, { success: false, message: err.message }, 500)
  }
}

async function getSchemes(req, res) {
  setCors(req, res)
  const url = new URL(req.url, 'http://localhost')
  const userId = url.searchParams.get('userId') || req.query?.userId
  if (!userId?.trim()) return json(res, { success: false, message: '缺少 userId' }, 400)

  try {
    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('volunteer_schemes')
      .select('scheme_id, user_id, scheme_name, province, subject_type, rank, status, created_at, updated_at')
      .eq('user_id', userId.trim())
      .neq('status', 'archived')
      .order('updated_at', { ascending: false })

    if (error) return json(res, { success: false, message: error.message }, 500)

    return json(res, {
      success: true,
      schemes: (data || []).map((row) => ({
        schemeId: row.scheme_id,
        userId: row.user_id,
        schemeName: row.scheme_name,
        province: row.province,
        subjectType: row.subject_type,
        rank: row.rank,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
    })
  } catch (err) {
    return json(res, { success: false, message: err.message }, 500)
  }
}

async function getSchemeById(req, res, schemeId) {
  setCors(req, res)
  const url = new URL(req.url, 'http://localhost')
  const userId = url.searchParams.get('userId') || req.query?.userId

  try {
    const supabase = getSupabase()
    let query = supabase.from('volunteer_schemes').select('*').eq('scheme_id', schemeId)
    if (userId?.trim()) query = query.eq('user_id', userId.trim())

    const { data: scheme, error: schemeErr } = await query.single()
    if (schemeErr || !scheme) return json(res, { success: false, message: '方案不存在' }, 404)

    const { data: items, error: itemsErr } = await supabase
      .from('volunteer_items')
      .select('*')
      .eq('scheme_id', schemeId)
      .order('sort_order')

    if (itemsErr) return json(res, { success: false, message: itemsErr.message }, 500)

    return json(res, {
      success: true,
      scheme: mapSchemeRow(scheme),
      items: (items || []).map(mapItemRow),
    })
  } catch (err) {
    return json(res, { success: false, message: err.message }, 500)
  }
}

async function putSchemeById(req, res, schemeId) {
  setCors(req, res)
  const body = await getBody(req)
  const { userId, schemeName, status, items = [] } = body

  if (!userId?.trim()) return json(res, { success: false, message: '缺少 userId' }, 400)

  try {
    const supabase = getSupabase()

    const { data: existing, error: existErr } = await supabase
      .from('volunteer_schemes')
      .select('scheme_id')
      .eq('scheme_id', schemeId)
      .eq('user_id', userId.trim())
      .single()

    if (existErr || !existing) return json(res, { success: false, message: '方案不存在或无权限' }, 404)

    const updates = { updated_at: new Date().toISOString() }
    if (schemeName != null) updates.scheme_name = schemeName
    if (status != null) updates.status = status

    const { error: updateErr } = await supabase
      .from('volunteer_schemes')
      .update(updates)
      .eq('scheme_id', schemeId)

    if (updateErr) return json(res, { success: false, message: updateErr.message }, 500)

    if (Array.isArray(items)) {
      await supabase.from('volunteer_items').delete().eq('scheme_id', schemeId)

      if (items.length > 0) {
        const itemRows = items.map((item, idx) => ({
          scheme_id: schemeId,
          sort_order: item.sortOrder ?? idx + 1,
          tier_label: item.tierLabel,
          gradient_level: item.gradientLevel ?? null,
          college_name: item.collegeName,
          major_name: item.majorName,
          admission_data_id: item.admissionDataId ?? null,
          predicted_rank: item.predictedRank ?? null,
          predicted_min_rank: item.predictedMinRank ?? item.predictedRank ?? null,
          probability: item.probability ?? null,
          rank_ratio: item.rankRatio ?? null,
          min_score: item.minScore ?? null,
          avg_score: item.avgScore ?? null,
          min_rank: item.minRank ?? null,
          subject_requirement: item.subjectRequirement ?? null,
          is_manual: item.isManual ?? false,
          ext_json: item.extJson ?? {},
        }))

        const { error: insertErr } = await supabase.from('volunteer_items').insert(itemRows)
        if (insertErr) return json(res, { success: false, message: insertErr.message }, 500)
      }
    }

    return getSchemeById(req, res, schemeId)
  } catch (err) {
    return json(res, { success: false, message: err.message }, 500)
  }
}

export default async function volunteerApiHandler(req, res) {
  if (req.method === 'OPTIONS') {
    setCors(req, res)
    return res.status(204).end()
  }

  const pathname = getPathname(req)

  if (pathname === '/api/volunteer/generate' && req.method === 'POST') {
    return postGenerate(req, res)
  }
  if (pathname === '/api/volunteer/schemes' && req.method === 'GET') {
    return getSchemes(req, res)
  }

  const detailMatch = pathname.match(/^\/api\/volunteer\/scheme\/([^/]+)$/)
  if (detailMatch) {
    const schemeId = detailMatch[1]
    if (req.method === 'GET') return getSchemeById(req, res, schemeId)
    if (req.method === 'PUT') return putSchemeById(req, res, schemeId)
  }

  return json(res, { success: false, message: `未知路由: ${pathname}` }, 404)
}
