/**
 * 学生端 API 处理器
 * 处理诊断历史、班级对比、教育规划进度等学生端专属路由
 */

import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    ''
  return createClient(url, key)
}

/** 获取请求体（兼容 Vercel Serverless 已解析或未解析的情况） */
async function getBody(req) {
  if (req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0) {
    return req.body
  }
  return new Promise((resolve) => {
    let raw = ''
    req.on('data', (chunk) => { raw += chunk })
    req.on('end', () => {
      try { resolve(JSON.parse(raw)) }
      catch { resolve({}) }
    })
  })
}

function json(res, data, status = 200) {
  res.status(status).json(data)
}

/** CORS 头（学生端跨域） */
function setCorsHeaders(req, res) {
  const origin = req.headers?.origin || '*'
  res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-supabase-auth')
  res.setHeader('Access-Control-Allow-Credentials', 'true')
}

// ============================================================
// 1. GET /api/student/diagnosis-history
//    获取学生历史诊断记录（用于进步趋势图）
// ============================================================
async function getDiagnosisHistory(req, res) {
  setCorsHeaders(req, res)
  try {
    const supabase = getSupabase()
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
    const userId = url.searchParams.get('userId') || req.query?.userId
    const subject = url.searchParams.get('subject') || req.query?.subject
    const limit = parseInt(url.searchParams.get('limit') || '10', 10)

    if (!userId) return json(res, { success: false, message: '缺少 userId' }, 400)

    let query = supabase
      .from('diagnosis_records')
      .select('id, exam_type, subject, score, full_score, grade_rank, class_rank, percentile, created_at')
      .eq('student_user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (subject) query = query.eq('subject', subject)

    const { data, error } = await query

    if (error) {
      console.error('[studentApi] 查询诊断历史失败', error)
      return json(res, { success: false, message: '数据库查询失败' }, 500)
    }

    const history = (data || []).map((r) => ({
      id: r.id,
      examType: r.exam_type,
      subject: r.subject,
      score: r.score,
      fullScore: r.full_score,
      gradeRank: r.grade_rank,
      classRank: r.class_rank,
      percentile: r.percentile,
      generatedAt: r.created_at,
    }))

    return json(res, { success: true, history })
  } catch (err) {
    console.error('[studentApi] getDiagnosisHistory error', err)
    return json(res, { success: false, message: err.message }, 500)
  }
}

// ============================================================
// 2. GET /api/student/class-comparison
//    获取班级/年级对比数据
// ============================================================
async function getClassComparison(req, res) {
  setCorsHeaders(req, res)
  try {
    const supabase = getSupabase()
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
    const userId = url.searchParams.get('userId') || req.query?.userId
    const subject = url.searchParams.get('subject') || req.query?.subject

    if (!userId) return json(res, { success: false, message: '缺少 userId' }, 400)

    // 获取该学生最新诊断
    const { data: latestDiag } = await supabase
      .from('diagnosis_records')
      .select('score, full_score, grade_rank, class_rank, percentile, subject')
      .eq('student_user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!latestDiag) {
      return json(res, { success: true, comparison: null, message: '暂无诊断数据' })
    }

    // 获取同年级同科目的统计数据
    let statsQuery = supabase
      .from('diagnosis_records')
      .select('score, full_score, grade_rank, class_rank')

    if (subject) statsQuery = statsQuery.eq('subject', subject)

    const { data: allRecords } = await statsQuery

    const records = allRecords || []
    if (records.length === 0) {
      return json(res, {
        success: true,
        comparison: {
          studentScore: latestDiag.score,
          studentRank: latestDiag.grade_rank || 0,
          totalStudents: 0,
          classAvg: 0,
          gradeAvg: 0,
          classTop: 0,
          gradeTop: 0,
          scoreDistribution: [],
          percentile: latestDiag.percentile || 0,
          strongerThan: 0,
        },
      })
    }

    // 计算统计数据
    const scores = records.map((r) => r.score).filter(Boolean)
    const classAvg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0
    const classTop = Math.max(...scores, 0)
    const gradeTop = classTop // 简化：用同一批数据

    // 分数分布
    const distribution = [
      { range: '0-59', count: 0 },
      { range: '60-69', count: 0 },
      { range: '70-79', count: 0 },
      { range: '80-89', count: 0 },
      { range: '90-100', count: 0 },
    ]
    scores.forEach((s) => {
      if (s < 60) distribution[0].count++
      else if (s < 70) distribution[1].count++
      else if (s < 80) distribution[2].count++
      else if (s < 90) distribution[3].count++
      else distribution[4].count++
    })

    const strongerThan = scores.filter((s) => s < (latestDiag.score || 0)).length
    const totalStudents = scores.length

    const comparison = {
      studentScore: latestDiag.score || 0,
      studentRank: latestDiag.grade_rank || 0,
      totalStudents,
      classAvg: Math.round(classAvg * 10) / 10,
      gradeAvg: Math.round(classAvg * 10) / 10, // 简化
      classTop,
      gradeTop,
      scoreDistribution: distribution,
      percentile: Math.round((strongerThan / Math.max(totalStudents, 1)) * 100),
      strongerThan,
    }

    return json(res, { success: true, comparison })
  } catch (err) {
    console.error('[studentApi] getClassComparison error', err)
    return json(res, { success: false, message: err.message }, 500)
  }
}

// ============================================================
// 3. POST /api/student/planning-progress
//    保存/更新规划任务勾选进度（存储到 Supabase）
// ============================================================
async function savePlanningProgress(req, res) {
  setCorsHeaders(req, res)
  try {
    const body = await getBody(req)
    const { planId, userId, phaseIndex, taskIndex, taskName, completed, notes } = body

    if (!planId || !userId) {
      return json(res, { success: false, message: '缺少 planId 或 userId' }, 400)
    }

    const supabase = getSupabase()

    // 使用 planId + userId + taskIndex 作为唯一键
    const taskKey = `${phaseIndex}_${taskIndex}`

    // 先查是否存在
    const { data: existing } = await supabase
      .from('planning_task_progress')
      .select('id')
      .eq('plan_id', planId)
      .eq('student_user_id', userId)
      .eq('task_key', taskKey)
      .maybeSingle()

    const record = {
      plan_id: planId,
      student_user_id: userId,
      phase_index: phaseIndex,
      task_index: taskIndex,
      task_key: taskKey,
      task_name: taskName || '',
      completed: !!completed,
      completed_at: completed ? new Date().toISOString() : null,
      notes: notes || '',
      updated_at: new Date().toISOString(),
    }

    let result
    if (existing) {
      result = await supabase
        .from('planning_task_progress')
        .update(record)
        .eq('id', existing.id)
        .select()
        .single()
    } else {
      result = await supabase
        .from('planning_task_progress')
        .insert(record)
        .select()
        .single()
    }

    if (result.error) {
      console.error('[studentApi] 保存规划进度失败', result.error)
      return json(res, { success: false, message: result.error.message }, 500)
    }

    return json(res, { success: true, progress: result.data })
  } catch (err) {
    console.error('[studentApi] savePlanningProgress error', err)
    return json(res, { success: false, message: err.message }, 500)
  }
}

// ============================================================
// 4. GET /api/student/planning-progress
//    获取某规划的进度数据
// ============================================================
async function getPlanningProgress(req, res) {
  setCorsHeaders(req, res)
  try {
    const supabase = getSupabase()
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
    const planId = url.searchParams.get('planId') || req.query?.planId
    const userId = url.searchParams.get('userId') || req.query?.userId

    if (!planId) return json(res, { success: false, message: '缺少 planId' }, 400)

    let query = supabase
      .from('planning_task_progress')
      .select('*')
      .eq('plan_id', planId)
      .order('phase_index', { ascending: true })
      .order('task_index', { ascending: true })

    if (userId) query = query.eq('student_user_id', userId)

    const { data, error } = await query

    if (error) {
      console.error('[studentApi] 查询规划进度失败', error)
      return json(res, { success: false, message: '数据库查询失败' }, 500)
    }

    const progress = (data || []).map((r) => ({
      planId: r.plan_id,
      phaseIndex: r.phase_index,
      taskIndex: r.task_index,
      taskName: r.task_name,
      completed: r.completed,
      completedAt: r.completed_at,
      notes: r.notes,
      updatedAt: r.updated_at,
    }))

    return json(res, { success: true, progress })
  } catch (err) {
    console.error('[studentApi] getPlanningProgress error', err)
    return json(res, { success: false, message: err.message }, 500)
  }
}

// ============================================================
// 5. GET /api/teacher/student-plans
//    教师端查看学生规划执行情况
// ============================================================
async function getStudentPlansForTeacher(req, res) {
  setCorsHeaders(req, res)
  try {
    const supabase = getSupabase()
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
    const teacherId = url.searchParams.get('teacherId') || req.query?.teacherId
    // 可选过滤参数
    const studentName = url.searchParams.get('studentName') || req.query?.studentName

    // 查询该教师创建的规划及其进度
    let planQuery = supabase
      .from('planning_records')
      .select('id, student_name, student_user_id, report_title, phase_count, subject, created_at')

    if (teacherId) planQuery = planQuery.eq('creator_user_id', teacherId)
    if (studentName) planQuery = planQuery.ilike('student_name', `%${studentName}%`)

    planQuery = planQuery.order('created_at', { ascending: false }).limit(50)

    const { data: plans, error } = await planQuery

    if (error) {
      console.error('[studentApi] 查询学生规划失败', error)
      return json(res, { success: false, message: '数据库查询失败' }, 500)
    }

    if (!plans || plans.length === 0) {
      return json(res, { success: true, summaries: [] })
    }

    // 批量获取进度
    const planIds = plans.map((p) => p.id)
    const { data: allProgress } = await supabase
      .from('planning_task_progress')
      .select('plan_id, completed')
      .in('plan_id', planIds)

    const progressMap = {}
    if (allProgress) {
      allProgress.forEach((p) => {
        if (!progressMap[p.plan_id]) progressMap[p.plan_id] = { total: 0, completed: 0 }
        progressMap[p.plan_id].total++
        if (p.completed) progressMap[p.plan_id].completed++
      })
    }

    const summaries = plans.map((p) => {
      const pg = progressMap[p.id] || { total: 0, completed: 0 }
      return {
        studentId: p.student_user_id,
        studentName: p.student_name,
        planTitle: p.report_title || '教育规划',
        totalTasks: pg.total,
        completedTasks: pg.completed,
        progressPercent: pg.total > 0 ? Math.round((pg.completed / pg.total) * 100) : 0,
        lastActivityAt: p.created_at,
      }
    })

    return json(res, { success: true, summaries })
  } catch (err) {
    console.error('[studentApi] getStudentPlansForTeacher error', err)
    return json(res, { success: false, message: err.message }, 500)
  }
}

// ============================================================
// 6. OPTIONS — CORS 预检请求
// ============================================================
async function handleOptions(req, res) {
  setCorsHeaders(req, res)
  return json(res, { success: true })
}

// ============================================================
// 主分发函数
// ============================================================
export default async function studentApiHandler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
  const pathname = url.pathname

  console.log('[studentApi] 请求', { method: req.method, pathname })

  // CORS 预检
  if (req.method === 'OPTIONS') return handleOptions(req, res)

  try {
    // GET /api/student/diagnosis-history
    if (pathname === '/api/student/diagnosis-history' && req.method === 'GET') {
      return getDiagnosisHistory(req, res)
    }

    // GET /api/student/class-comparison
    if (pathname === '/api/student/class-comparison' && req.method === 'GET') {
      return getClassComparison(req, res)
    }

    // POST /api/student/planning-progress
    if (pathname === '/api/student/planning-progress' && req.method === 'POST') {
      return savePlanningProgress(req, res)
    }

    // GET /api/student/planning-progress
    if (pathname === '/api/student/planning-progress' && req.method === 'GET') {
      return getPlanningProgress(req, res)
    }

    // GET /api/teacher/student-plans
    if (pathname === '/api/teacher/student-plans' && req.method === 'GET') {
      return getStudentPlansForTeacher(req, res)
    }

    return json(res, { success: false, message: `未知学生 API 路由: ${pathname}` }, 404)
  } catch (err) {
    console.error('[studentApi] 未处理的错误', err)
    return json(res, { success: false, message: '服务器内部错误' }, 500)
  }
}
