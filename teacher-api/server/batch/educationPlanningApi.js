/**
 * 教育规划系统 API — 7大升学路线、甘特图数据、周报/月报、家长绑定
 *
 * 路由清单：
 *   GET  /api/planning/routes              — 获取全部升学路线
 *   GET  /api/planning/routes/:code        — 获取单条路线+阶段+任务详情
 *   POST /api/planning/student-plan        — 创建/更新学生规划
 *   GET  /api/planning/student-plan        — 查询学生规划列表
 *   GET  /api/planning/gantt/:planId       — 获取甘特图JSON数据
 *   POST /api/planning/task-update         — 更新任务进度
 *   GET  /api/planning/weekly-report       — 获取周报
 *   GET  /api/planning/monthly-report      — 获取月报
 *   GET  /api/planning/teacher-overview    — 教师端全班概览
 *
 * 家长绑定：
 *   POST /api/parent/generate-code         — 学生生成邀请码
 *   POST /api/parent/bind                  — 家长通过邀请码绑定
 *   GET  /api/parent/bindings              — 查询绑定关系
 *   POST /api/parent/unbind                — 解绑
 *   POST /api/parent/batch-bind            — 教师后台批量绑定
 *   GET  /api/parent/student-view          — 家长端查看学生数据
 */

import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    ''
  return createClient(url, key, { auth: { persistSession: false } })
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

function getQueryParams(req) {
  const url = new URL(req.url, 'http://localhost')
  const params = {}
  url.searchParams.forEach((v, k) => { params[k] = v })
  return { ...params, ...(req.query || {}) }
}

// ============================================================
// 1. GET /api/planning/routes — 获取全部升学路线
// ============================================================
async function getRoutes(req, res) {
  setCors(req, res)
  try {
    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('sys_plan_route')
      .select('*')
      .eq('is_active', true)
      .order('sort')

    if (error) return json(res, { success: false, message: error.message }, 500)
    return json(res, { success: true, routes: data })
  } catch (err) {
    return json(res, { success: false, message: err.message }, 500)
  }
}

// ============================================================
// 2. GET /api/planning/routes/:code — 获取单条路线详细数据
// ============================================================
async function getRouteDetail(req, res, routeCode) {
  setCors(req, res)
  try {
    const supabase = getSupabase()

    const { data: route, error: routeErr } = await supabase
      .from('sys_plan_route')
      .select('*')
      .eq('route_code', routeCode)
      .single()

    if (routeErr || !route) return json(res, { success: false, message: '路线不存在' }, 404)

    const { data: stages, error: stageErr } = await supabase
      .from('sys_plan_stage')
      .select('*')
      .eq('route_id', route.route_id)
      .order('sort')

    if (stageErr) return json(res, { success: false, message: stageErr.message }, 500)

    // 获取所有阶段的任务模板
    const stageIds = (stages || []).map((s) => s.stage_id)
    let templates = []
    if (stageIds.length > 0) {
      const { data: tmpl } = await supabase
        .from('sys_task_template')
        .select('*')
        .in('stage_id', stageIds)
        .order('sort')
      templates = tmpl || []
    }

    // 组装响应
    const stageList = (stages || []).map((s) => ({
      ...s,
      tasks: templates.filter((t) => t.stage_id === s.stage_id),
    }))

    return json(res, { success: true, route: { ...route, stages: stageList } })
  } catch (err) {
    return json(res, { success: false, message: err.message }, 500)
  }
}

// ============================================================
// 3. POST /api/planning/student-plan — 创建/更新学生规划
// ============================================================
async function saveStudentPlan(req, res) {
  setCors(req, res)
  try {
    const supabase = getSupabase()
    const body = await getBody(req)
    const {
      plan_id, student_user_id, student_name, route_id, plan_title,
      plan_start_date, plan_end_date, creator_user_id, created_by, tasks,
    } = body

    if (!student_user_id) return json(res, { success: false, message: '缺少 student_user_id' }, 400)
    if (!route_id) return json(res, { success: false, message: '缺少 route_id' }, 400)

    let planId = plan_id
    const planRecord = {
      student_user_id,
      student_name: student_name || '',
      route_id,
      plan_title: plan_title || '教育规划',
      plan_start_date: plan_start_date || new Date().toISOString().split('T')[0],
      plan_end_date: plan_end_date || null,
      creator_user_id: creator_user_id || student_user_id,
      created_by: created_by || 'student',
      plan_data: { tasks: tasks || [] },
      updated_at: new Date().toISOString(),
    }

    if (planId) {
      const { error } = await supabase.from('user_student_plan').update(planRecord).eq('plan_id', planId)
      if (error) return json(res, { success: false, message: error.message }, 500)
    } else {
      const { data, error } = await supabase.from('user_student_plan').insert(planRecord).select('plan_id').single()
      if (error) return json(res, { success: false, message: error.message }, 500)
      planId = data.plan_id
    }

    // 批量 upsert 任务记录
    if (tasks && Array.isArray(tasks) && tasks.length > 0) {
      const taskRecords = tasks.map((t) => ({
        plan_id: planId,
        temp_id: t.temp_id || null,
        task_name: t.task_name,
        route_type: t.route_type || null,
        stage_name: t.stage_name || null,
        start_date: t.start_date || null,
        end_date: t.end_date || null,
        task_days: t.task_days || 0,
        is_parallel: t.is_parallel ?? false,
        pre_task_id: t.pre_task_id || null,
        complete_rate: t.complete_rate || 0,
        status: t.status || 'unfinish',
        notes: t.notes || '',
      }))

      // 先删旧任务，再插入新任务
      await supabase.from('user_task_record').delete().eq('plan_id', planId)
      const { error: taskErr } = await supabase.from('user_task_record').insert(taskRecords)
      if (taskErr) console.warn('[eduPlanApi] 任务写入失败', taskErr)
    }

    return json(res, { success: true, plan_id: planId })
  } catch (err) {
    return json(res, { success: false, message: err.message }, 500)
  }
}

// ============================================================
// 4. GET /api/planning/student-plan — 查询学生规划列表
// ============================================================
async function getStudentPlans(req, res) {
  setCors(req, res)
  try {
    const supabase = getSupabase()
    const params = getQueryParams(req)
    const { student_user_id, creator_user_id } = params

    let query = supabase.from('user_student_plan').select('*').order('created_at', { ascending: false })
    if (student_user_id) query = query.eq('student_user_id', student_user_id)
    if (creator_user_id) query = query.eq('creator_user_id', creator_user_id)

    const { data, error } = await query.limit(50)
    if (error) return json(res, { success: false, message: error.message }, 500)

    // 批量获取任务和进度
    const planIds = (data || []).map((p) => p.plan_id)
    let taskMap = {}
    if (planIds.length > 0) {
      const { data: tasks } = await supabase
        .from('user_task_record')
        .select('*')
        .in('plan_id', planIds)
        .order('start_date', { ascending: true })
      if (tasks) {
        tasks.forEach((t) => {
          if (!taskMap[t.plan_id]) taskMap[t.plan_id] = []
          taskMap[t.plan_id].push(t)
        })
      }
    }

    const plans = (data || []).map((p) => {
      const taskList = taskMap[p.plan_id] || []
      const total = taskList.length
      const completed = taskList.filter((t) => t.status === 'finish').length
      const delayed = taskList.filter((t) => t.status === 'delay').length
      return {
        ...p,
        tasks: taskList,
        stats: { totalTasks: total, completedTasks: completed, delayedTasks: delayed, progressPercent: total > 0 ? Math.round((completed / total) * 100) : 0 },
      }
    })

    return json(res, { success: true, plans })
  } catch (err) {
    return json(res, { success: false, message: err.message }, 500)
  }
}

// ============================================================
// 5. GET /api/planning/gantt/:planId — 获取甘特图JSON
// ============================================================
async function getGanttData(req, res, planId) {
  setCors(req, res)
  try {
    const supabase = getSupabase()

    const { data: plan, error } = await supabase
      .from('user_student_plan')
      .select('*')
      .eq('plan_id', planId)
      .single()

    if (error || !plan) return json(res, { success: false, message: '规划不存在' }, 404)

    const { data: tasks } = await supabase
      .from('user_task_record')
      .select('*')
      .eq('plan_id', planId)
      .order('start_date', { ascending: true })

    const taskList = (tasks || []).map((t) => ({
      taskId: t.task_id,
      taskName: t.task_name,
      routeType: t.route_type || '',
      stageName: t.stage_name || '',
      startDate: t.start_date,
      endDate: t.end_date,
      taskDays: t.task_days || 0,
      isParallel: t.is_parallel || false,
      preTaskId: t.pre_task_id || '',
      completeRate: t.complete_rate || 0,
      status: t.status || 'unfinish',
      extJson: t.ext_json || '{}',
    }))

    return json(res, {
      success: true,
      gantt: {
        planId: plan.plan_id,
        planName: plan.plan_title || '教育规划',
        planStartDate: plan.plan_start_date,
        planEndDate: plan.plan_end_date,
        taskList,
      },
    })
  } catch (err) {
    return json(res, { success: false, message: err.message }, 500)
  }
}

// ============================================================
// 6. POST /api/planning/task-update — 更新任务进度
// ============================================================
async function updateTaskProgress(req, res) {
  setCors(req, res)
  try {
    const supabase = getSupabase()
    const body = await getBody(req)
    const { task_id, complete_rate, status, notes } = body

    if (!task_id) return json(res, { success: false, message: '缺少 task_id' }, 400)

    const update = { updated_at: new Date().toISOString() }
    if (complete_rate !== undefined) update.complete_rate = complete_rate
    if (status) update.status = status
    if (notes !== undefined) update.notes = notes

    const { error } = await supabase.from('user_task_record').update(update).eq('task_id', task_id)
    if (error) return json(res, { success: false, message: error.message }, 500)

    // 同步更新旧的 planning_task_progress 表（兼容）
    const { data: task } = await supabase.from('user_task_record').select('plan_id,task_name').eq('task_id', task_id).single()
    if (task) {
      await supabase.from('planning_task_progress').upsert({
        plan_id: task.plan_id,
        student_user_id: body.user_id || '',
        phase_index: 0,
        task_index: 0,
        task_key: task_id,
        task_name: task.task_name,
        completed: status === 'finish',
        completed_at: status === 'finish' ? new Date().toISOString() : null,
        notes: notes || '',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'plan_id, student_user_id, task_key' })
    }

    return json(res, { success: true })
  } catch (err) {
    return json(res, { success: false, message: err.message }, 500)
  }
}

// ============================================================
// 7. GET /api/planning/weekly-report — 获取周报
// ============================================================
async function getWeeklyReport(req, res) {
  setCors(req, res)
  try {
    const supabase = getSupabase()
    const params = getQueryParams(req)
    const { plan_id, user_id, week_start } = params

    if (!plan_id) return json(res, { success: false, message: '缺少 plan_id' }, 400)

    // 计算周范围（默认本周）
    const now = new Date()
    const startOfWeek = week_start
      ? new Date(week_start)
      : new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay() + 1) // 周一
    const endOfWeek = new Date(startOfWeek)
    endOfWeek.setDate(endOfWeek.getDate() + 6)

    const { data: tasks } = await supabase
      .from('user_task_record')
      .select('*')
      .eq('plan_id', plan_id)
      .order('start_date', { ascending: true })

    if (!tasks || tasks.length === 0) {
      return json(res, { success: true, report: { totalTasks: 0, completedTasks: 0, unfinishedTasks: 0, delayedTasks: 0, completionRate: 0, subjectBreakdown: [], timeComparison: { actual: 0, planned: 0 }, warnings: [], unfinishedList: [] } })
    }

    const total = tasks.length
    const completed = tasks.filter((t) => t.status === 'finish').length
    const unfinished = tasks.filter((t) => t.status === 'unfinish' || t.status === 'doing').length
    const delayed = tasks.filter((t) => t.status === 'delay').length
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0

    // 按阶段分组（模拟分科）
    const stageMap = {}
    tasks.forEach((t) => {
      const key = t.stage_name || '其他'
      if (!stageMap[key]) stageMap[key] = { total: 0, completed: 0 }
      stageMap[key].total++
      if (t.status === 'finish') stageMap[key].completed++
    })
    const subjectBreakdown = Object.entries(stageMap).map(([name, s]) => ({
      name,
      total: s.total,
      completed: s.completed,
      rate: s.total > 0 ? Math.round((s.completed / s.total) * 100) : 0,
    }))

    // 薄弱预警：单阶段完成率 < 60%
    const warnings = subjectBreakdown
      .filter((s) => s.rate < 60 && s.total > 0)
      .map((s) => ({ subject: s.name, rate: s.rate, message: `${s.name}完成率仅${s.rate}%，需要重点关注` }))

    const unfinishedList = tasks
      .filter((t) => t.status !== 'finish')
      .map((t) => ({ taskId: t.task_id, taskName: t.task_name, status: t.status, stageName: t.stage_name }))

    // 时长统计（从 ext_json 提取）
    let plannedMinutes = 0
    tasks.forEach((t) => {
      if (t.ext_json && t.ext_json.suggest_minutes) plannedMinutes += t.ext_json.suggest_minutes
    })

    return json(res, {
      success: true,
      report: {
        totalTasks: total,
        completedTasks: completed,
        unfinishedTasks: unfinished,
        delayedTasks: delayed,
        completionRate,
        subjectBreakdown,
        timeComparison: { actual: completed * 45, planned: plannedMinutes || total * 30 },
        warnings,
        unfinishedList,
        weekRange: { start: startOfWeek.toISOString().split('T')[0], end: endOfWeek.toISOString().split('T')[0] },
      },
    })
  } catch (err) {
    return json(res, { success: false, message: err.message }, 500)
  }
}

// ============================================================
// 8. GET /api/planning/monthly-report — 获取月报
// ============================================================
async function getMonthlyReport(req, res) {
  setCors(req, res)
  try {
    const supabase = getSupabase()
    const params = getQueryParams(req)
    const { plan_id, user_id, month } = params

    if (!plan_id) return json(res, { success: false, message: '缺少 plan_id' }, 400)

    const now = new Date()
    const targetMonth = month ? new Date(month + '-01') : new Date(now.getFullYear(), now.getMonth(), 1)
    const nextMonth = new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 1)

    const { data: tasks } = await supabase
      .from('user_task_record')
      .select('*')
      .eq('plan_id', plan_id)
      .order('start_date', { ascending: true })

    if (!tasks || tasks.length === 0) {
      return json(res, { success: true, report: { totalTasks: 0, completedTasks: 0, completionRate: 0, stageProgress: [], knowledgeCoverage: 0, standardMet: 0, standardTotal: 0, suggestions: [] } })
    }

    const total = tasks.length
    const completed = tasks.filter((t) => t.status === 'finish').length
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0

    // 分阶段进度
    const stageMap = {}
    tasks.forEach((t) => {
      const key = t.stage_name || '未分类'
      if (!stageMap[key]) stageMap[key] = { total: 0, completed: 0 }
      stageMap[key].total++
      if (t.status === 'finish') stageMap[key].completed++
    })
    const stageProgress = Object.entries(stageMap).map(([name, s]) => ({
      stageName: name,
      total: s.total,
      completed: s.completed,
      rate: s.total > 0 ? Math.round((s.completed / s.total) * 100) : 0,
    }))

    // 智能建议生成
    const suggestions = []
    const weakSubjects = stageProgress.filter((s) => s.rate < 50)
    if (weakSubjects.length > 0) {
      suggestions.push(`建议优先完成${weakSubjects.map((s) => s.stageName).join('、')}阶段的遗留任务`)
    }
    if (completionRate < 30) {
      suggestions.push('当前整体进度偏慢，建议适当增加每日学习时长')
    } else if (completionRate > 80) {
      suggestions.push('完成度优秀，可按计划进入下一阶段学习')
    }
    const delayed = tasks.filter((t) => t.status === 'delay')
    if (delayed.length > 0) {
      suggestions.push(`有${delayed.length}项任务已延期，建议重新评估时间安排`)
    }

    return json(res, {
      success: true,
      report: {
        totalTasks: total,
        completedTasks: completed,
        completionRate,
        stageProgress,
        knowledgeCoverage: completionRate, // 简化估算
        standardMet: completed,
        standardTotal: total,
        suggestions,
        month: targetMonth.toISOString().split('T')[0].substring(0, 7),
      },
    })
  } catch (err) {
    return json(res, { success: false, message: err.message }, 500)
  }
}

// ============================================================
// 9. GET /api/planning/teacher-overview — 教师端全班概览
// ============================================================
async function getTeacherOverview(req, res) {
  setCors(req, res)
  try {
    const supabase = getSupabase()
    const params = getQueryParams(req)
    const { teacher_id } = params

    let planQuery = supabase.from('user_student_plan').select('*').order('created_at', { ascending: false })
    if (teacher_id) planQuery = planQuery.eq('creator_user_id', teacher_id)
    planQuery = planQuery.limit(200)

    const { data: plans, error } = await planQuery
    if (error) return json(res, { success: false, message: error.message }, 500)
    if (!plans || plans.length === 0) return json(res, { success: true, students: [], classAvgRate: 0, weakStudents: [] })

    const planIds = plans.map((p) => p.plan_id)
    const { data: allTasks } = await supabase
      .from('user_task_record')
      .select('*')
      .in('plan_id', planIds)

    const taskMap = {}
    if (allTasks) {
      allTasks.forEach((t) => {
        if (!taskMap[t.plan_id]) taskMap[t.plan_id] = []
        taskMap[t.plan_id].push(t)
      })
    }

    const students = plans.map((p) => {
      const tl = taskMap[p.plan_id] || []
      const total = tl.length
      const completed = tl.filter((t) => t.status === 'finish').length
      const rate = total > 0 ? Math.round((completed / total) * 100) : 0
      return {
        planId: p.plan_id,
        studentId: p.student_user_id,
        studentName: p.student_name || '未知',
        planTitle: p.plan_title,
        routeName: p.route_id,
        totalTasks: total,
        completedTasks: completed,
        progressPercent: rate,
        lastActivity: p.updated_at || p.created_at,
      }
    })

    const allRates = students.map((s) => s.progressPercent)
    const classAvgRate = allRates.length > 0 ? Math.round(allRates.reduce((a, b) => a + b, 0) / allRates.length) : 0
    const weakStudents = students
      .filter((s) => s.progressPercent < 40)
      .map((s) => ({ studentName: s.studentName, progressPercent: s.progressPercent, planTitle: s.planTitle }))

    return json(res, { success: true, students, classAvgRate, weakStudents })
  } catch (err) {
    return json(res, { success: false, message: err.message }, 500)
  }
}

// ============================================================
// 10. POST /api/parent/generate-code — 学生生成邀请码
// ============================================================
async function generateInviteCode(req, res) {
  setCors(req, res)
  try {
    const supabase = getSupabase()
    const body = await getBody(req)
    const { student_user_id } = body
    if (!student_user_id) return json(res, { success: false, message: '缺少 student_user_id' }, 400)

    // 生成6位数字随机码
    const code = String(Math.floor(100000 + Math.random() * 900000))

    // upsert
    const { data, error } = await supabase
      .from('invite_code')
      .upsert({
        student_user_id,
        code,
        is_used: false,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7天有效
        created_at: new Date().toISOString(),
      }, { onConflict: 'student_user_id' })
      .select('code, expires_at')
      .single()

    if (error) return json(res, { success: false, message: error.message }, 500)
    return json(res, { success: true, code: data.code, expires_at: data.expires_at })
  } catch (err) {
    return json(res, { success: false, message: err.message }, 500)
  }
}

// ============================================================
// 11. POST /api/parent/bind — 家长通过邀请码绑定
// ============================================================
async function bindParent(req, res) {
  setCors(req, res)
  try {
    const supabase = getSupabase()
    const body = await getBody(req)
    const { parent_user_id, invite_code, student_user_id, bind_type } = body

    const bindType = bind_type || 'invite_code'
    let targetStudentId = student_user_id

    // 邀请码模式：查找学生
    if (bindType === 'invite_code') {
      if (!invite_code) return json(res, { success: false, message: '缺少邀请码' }, 400)
      const { data: ic, error: icErr } = await supabase
        .from('invite_code')
        .select('*')
        .eq('code', invite_code)
        .single()

      if (icErr || !ic) return json(res, { success: false, message: '邀请码无效' }, 404)
      if (new Date(ic.expires_at) < new Date()) return json(res, { success: false, message: '邀请码已过期' }, 400)
      targetStudentId = ic.student_user_id
    }

    if (!parent_user_id || !targetStudentId) {
      return json(res, { success: false, message: '缺少必要参数' }, 400)
    }

    // 检查绑定限制：1名学生最多3位家长
    const { data: existingBindings, error: countErr } = await supabase
      .from('parent_binding')
      .select('id')
      .eq('student_user_id', targetStudentId)
      .eq('status', 'active')

    if (countErr) return json(res, { success: false, message: countErr.message }, 500)
    if (existingBindings && existingBindings.length >= 3) {
      return json(res, { success: false, message: '该学生已绑定3位家长，达到上限' }, 400)
    }

    // 检查家长绑定数量：1位家长最多5名学生
    const { data: parentBindings, error: pCountErr } = await supabase
      .from('parent_binding')
      .select('id')
      .eq('parent_user_id', parent_user_id)
      .eq('status', 'active')

    if (pCountErr) return json(res, { success: false, message: pCountErr.message }, 500)
    if (parentBindings && parentBindings.length >= 5) {
      return json(res, { success: false, message: '该家长已绑定5名学生，达到上限' }, 400)
    }

    // 创建绑定
    const { data, error } = await supabase
      .from('parent_binding')
      .upsert({
        student_user_id: targetStudentId,
        parent_user_id,
        bind_type: bindType,
        invite_code: invite_code || null,
        status: 'active',
        bound_at: new Date().toISOString(),
      }, { onConflict: 'student_user_id, parent_user_id', ignoreDuplicates: false })
      .select()
      .single()

    if (error) return json(res, { success: false, message: error.message }, 500)

    // 标记邀请码已使用
    if (invite_code) {
      await supabase.from('invite_code').update({ is_used: true }).eq('code', invite_code)
    }

    return json(res, { success: true, binding: data })
  } catch (err) {
    return json(res, { success: false, message: err.message }, 500)
  }
}

// ============================================================
// 12. GET /api/parent/bindings — 查询绑定关系
// ============================================================
async function getBindings(req, res) {
  setCors(req, res)
  try {
    const supabase = getSupabase()
    const params = getQueryParams(req)
    const { user_id, role } = params

    let query = supabase.from('parent_binding').select('*').eq('status', 'active')
    if (role === 'student') query = query.eq('student_user_id', user_id)
    else if (role === 'parent') query = query.eq('parent_user_id', user_id)
    else {
      query = query.or(`student_user_id.eq.${user_id},parent_user_id.eq.${user_id}`)
    }

    const { data, error } = await query
    if (error) return json(res, { success: false, message: error.message }, 500)
    return json(res, { success: true, bindings: data || [] })
  } catch (err) {
    return json(res, { success: false, message: err.message }, 500)
  }
}

// ============================================================
// 13. POST /api/parent/unbind — 解绑
// ============================================================
async function unbind(req, res) {
  setCors(req, res)
  try {
    const supabase = getSupabase()
    const body = await getBody(req)
    const { binding_id, initiated_by } = body
    if (!binding_id) return json(res, { success: false, message: '缺少 binding_id' }, 400)

    const { error } = await supabase
      .from('parent_binding')
      .update({ status: 'unbound', unbound_at: new Date().toISOString() })
      .eq('id', binding_id)

    if (error) return json(res, { success: false, message: error.message }, 500)
    return json(res, { success: true, message: '解绑成功' })
  } catch (err) {
    return json(res, { success: false, message: err.message }, 500)
  }
}

// ============================================================
// 14. POST /api/parent/batch-bind — 教师后台批量绑定
// ============================================================
async function batchBind(req, res) {
  setCors(req, res)
  try {
    const supabase = getSupabase()
    const body = await getBody(req)
    const { bindings } = body // [{student_user_id, parent_user_id, student_name?}]

    if (!bindings || !Array.isArray(bindings) || bindings.length === 0) {
      return json(res, { success: false, message: '缺少 bindings 参数' }, 400)
    }

    const records = bindings.map((b) => ({
      student_user_id: b.student_user_id,
      parent_user_id: b.parent_user_id,
      bind_type: 'batch',
      status: 'active',
      bound_at: new Date().toISOString(),
    }))

    const { error } = await supabase.from('parent_binding').upsert(records, {
      onConflict: 'student_user_id, parent_user_id',
      ignoreDuplicates: false,
    })

    if (error) return json(res, { success: false, message: error.message }, 500)
    return json(res, { success: true, message: `成功绑定 ${records.length} 条关系` })
  } catch (err) {
    return json(res, { success: false, message: err.message }, 500)
  }
}

// ============================================================
// 15. GET /api/parent/student-view — 家长端查看学生数据（只读）
// ============================================================
async function getParentStudentView(req, res) {
  setCors(req, res)
  try {
    const supabase = getSupabase()
    const params = getQueryParams(req)
    const { parent_user_id, student_user_id } = params

    if (!parent_user_id || !student_user_id) {
      return json(res, { success: false, message: '缺少参数' }, 400)
    }

    // 验证绑定关系
    const { data: binding, error: bindErr } = await supabase
      .from('parent_binding')
      .select('*')
      .eq('parent_user_id', parent_user_id)
      .eq('student_user_id', student_user_id)
      .eq('status', 'active')
      .maybeSingle()

    if (bindErr || !binding) return json(res, { success: false, message: '无权限查看该学生数据' }, 403)

    // 获取规划
    const { data: plans } = await supabase
      .from('user_student_plan')
      .select('*')
      .eq('student_user_id', student_user_id)
      .order('created_at', { ascending: false })
      .limit(10)

    // 获取任务
    let tasks = []
    if (plans && plans.length > 0) {
      const planIds = plans.map((p) => p.plan_id)
      const { data: taskData } = await supabase
        .from('user_task_record')
        .select('*')
        .in('plan_id', planIds)
        .order('start_date', { ascending: true })
      tasks = taskData || []
    }

    return json(res, {
      success: true,
      data: {
        student_user_id,
        plans: plans || [],
        tasks,
        viewMode: 'readonly',
      },
    })
  } catch (err) {
    return json(res, { success: false, message: err.message }, 500)
  }
}

// ============================================================
// 0. POST /api/planning/university-lookup — 目标院校数据检索
// ============================================================
async function postUniversityLookup(req, res) {
  try {
    const body = await getBody(req)
    const { targetUniversity, province, major } = body ?? {}
    if (!targetUniversity?.trim() || !province?.trim()) {
      return json(res, { success: false, message: '请提供目标院校与省份' }, 400)
    }
    const { lookupTargetUniversity } = await import('../planningEngine.js')
    const lookup = lookupTargetUniversity(
      targetUniversity.trim(),
      province.trim(),
      (major || '通用').trim(),
    )
    return json(res, { success: true, lookup })
  } catch (err) {
    return json(res, { success: false, message: err.message }, 500)
  }
}

// ============================================================
// 主分发函数
// ============================================================
export default async function educationPlanningApiHandler(req, res) {
  const url = new URL(req.url, 'http://localhost')
  const pathname = url.pathname

  if (req.method === 'OPTIONS') return handleOptions(req, res)

  try {
    // POST /api/planning/university-lookup
    if (pathname === '/api/planning/university-lookup' && req.method === 'POST') {
      return postUniversityLookup(req, res)
    }

    // GET /api/planning/routes
    if (pathname === '/api/planning/routes' && req.method === 'GET') return getRoutes(req, res)

    // GET /api/planning/routes/:code
    const routeDetailMatch = pathname.match(/^\/api\/planning\/routes\/([a-z]+)$/)
    if (routeDetailMatch && req.method === 'GET') return getRouteDetail(req, res, routeDetailMatch[1])

    // POST /api/planning/student-plan
    if (pathname === '/api/planning/student-plan' && req.method === 'POST') return saveStudentPlan(req, res)

    // GET /api/planning/student-plan
    if (pathname === '/api/planning/student-plan' && req.method === 'GET') return getStudentPlans(req, res)

    // GET /api/planning/gantt/:planId
    const ganttMatch = pathname.match(/^\/api\/planning\/gantt\/([a-f0-9-]+)$/)
    if (ganttMatch && req.method === 'GET') return getGanttData(req, res, ganttMatch[1])

    // POST /api/planning/task-update
    if (pathname === '/api/planning/task-update' && req.method === 'POST') return updateTaskProgress(req, res)

    // GET /api/planning/weekly-report
    if (pathname === '/api/planning/weekly-report' && req.method === 'GET') return getWeeklyReport(req, res)

    // GET /api/planning/monthly-report
    if (pathname === '/api/planning/monthly-report' && req.method === 'GET') return getMonthlyReport(req, res)

    // GET /api/planning/teacher-overview
    if (pathname === '/api/planning/teacher-overview' && req.method === 'GET') return getTeacherOverview(req, res)

    // 家长绑定路由
    if (pathname === '/api/parent/generate-code' && req.method === 'POST') return generateInviteCode(req, res)
    if (pathname === '/api/parent/bind' && req.method === 'POST') return bindParent(req, res)
    if (pathname === '/api/parent/bindings' && req.method === 'GET') return getBindings(req, res)
    if (pathname === '/api/parent/unbind' && req.method === 'POST') return unbind(req, res)
    if (pathname === '/api/parent/batch-bind' && req.method === 'POST') return batchBind(req, res)
    if (pathname === '/api/parent/student-view' && req.method === 'GET') return getParentStudentView(req, res)

    return json(res, { success: false, message: `未知规划 API 路由: ${pathname}` }, 404)
  } catch (err) {
    console.error('[eduPlanApi] 分发错误', err)
    return json(res, { success: false, message: '服务器内部错误' }, 500)
  }
}

function handleOptions(req, res) {
  setCors(req, res)
  return json(res, { success: true })
}
