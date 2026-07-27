/**
 * 浙江省高考志愿 — API 扩展路由
 */
import { createServiceRoleClient } from '../../supabaseAdmin.js'
import { ZHEJIANG_RULES_SECTIONS, ZHEJIANG_RULES_SUMMARY } from './constants.js'
import { validateZhejiangVolunteerInput, validateZhejiangVolunteerItems } from './complianceChecker.js'
import { convertScoreRank } from './rankScoreBridge.js'
import { recommendSameRankColleges } from './sameRankRecommend.js'
import { flattenZhejiangPlans } from './recommendEngine.js'
import { buildBenchmarkRecommendations } from './benchmarkRecommend.js'
import { queryScoreDistribution } from './scoreRankService.js'

function json(res, data, status = 200) {
  res.status(status).json(data)
}

async function getBody(req) {
  if (req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0) return req.body
  return new Promise((resolve) => {
    let raw = ''
    req.on('data', (chunk) => { raw += chunk })
    req.on('end', () => { try { resolve(JSON.parse(raw)) } catch { resolve({}) } })
  })
}

async function fetchZhejiangPlans(supabase, input) {
  let query = supabase
    .from('zhejiang_admission_plans')
    .select('*')
    .eq('subject_type', input.subjectType)
    .eq('batch_segment', input.batchSegment || '一段')
    .order('exam_year', { ascending: false })

  if (input.examYear) query = query.lte('exam_year', input.examYear)

  const { data, error } = await query
  if (error) {
    if (/zhejiang_admission_plans|does not exist|column/.test(error.message)) return []
    throw new Error(error.message)
  }
  return data ?? []
}

async function fetchLegacyAdmission(supabase, input) {
  const { data, error } = await supabase
    .from('college_admission_data')
    .select('*')
    .eq('province', '浙江')
    .eq('subject_type', input.subjectType)
    .order('year', { ascending: false })
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function handleZhejiangVolunteerRoute(req, res, pathname) {
  const body = req.method === 'GET' ? {} : await getBody(req)
  const supabase = createServiceRoleClient()

  if (pathname === '/api/volunteer/zhejiang/rules' && req.method === 'GET') {
    json(res, {
      success: true,
      summary: ZHEJIANG_RULES_SUMMARY,
      sections: ZHEJIANG_RULES_SECTIONS,
    })
    return true
  }

  if (pathname === '/api/volunteer/zhejiang/validate' && req.method === 'POST') {
    const result = validateZhejiangVolunteerInput(body)
    if (body.items) {
      const itemCheck = validateZhejiangVolunteerItems(body.items, body.batchSegment)
      result.issues = [...(result.issues || []), ...itemCheck.issues]
      result.valid = result.valid && itemCheck.valid
    }
    json(res, { success: true, ...result })
    return true
  }

  if (pathname === '/api/volunteer/zhejiang/convert' && req.method === 'POST') {
    const result = await convertScoreRank(body, supabase)
    json(res, result, result.success ? 200 : 400)
    return true
  }

  if (pathname === '/api/volunteer/zhejiang/same-rank' && req.method === 'POST') {
    const input = body
    let plans = await fetchZhejiangPlans(supabase, input)
    let rows = plans.length ? flattenZhejiangPlans(plans) : await fetchLegacyAdmission(supabase, input)
    const result = recommendSameRankColleges(input, rows)
    json(res, { success: true, ...result })
    return true
  }

  if (pathname === '/api/volunteer/zhejiang/benchmark' && req.method === 'POST') {
    const input = body
    let plans = await fetchZhejiangPlans(supabase, input)
    let rows = plans.length ? flattenZhejiangPlans(plans) : await fetchLegacyAdmission(supabase, input)
    const result = buildBenchmarkRecommendations(rows, input)
    json(res, result, result.success ? 200 : 400)
    return true
  }

  if (pathname === '/api/volunteer/zhejiang/score-distribution' && req.method === 'POST') {
    const result = await queryScoreDistribution(supabase, body)
    json(res, result, result.success ? 200 : 400)
    return true
  }

  return false
}

export default handleZhejiangVolunteerRoute
