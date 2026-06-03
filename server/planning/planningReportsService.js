import { getSupabaseAdmin, isSupabaseAdminConfigured } from '../supabaseAdmin.js'

function admin() {
  return getSupabaseAdmin()
}

function mondayOfWeek(d) {
  const date = new Date(d)
  const day = date.getDay() || 7
  if (day !== 1) date.setDate(date.getDate() - (day - 1))
  date.setHours(0, 0, 0, 0)
  return date
}

function parseWeekStart(weekStart) {
  if (weekStart) {
    const d = new Date(weekStart)
    if (!Number.isNaN(d.getTime())) return mondayOfWeek(d)
  }
  return mondayOfWeek(new Date())
}

function parseMonth(monthStr) {
  if (monthStr && /^\d{4}-\d{2}$/.test(monthStr)) {
    const [y, m] = monthStr.split('-').map(Number)
    return new Date(y, m - 1, 1)
  }
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), 1)
}

async function resolveStudentPlan(studentId, planId) {
  const db = admin()
  if (planId) {
    const { data } = await db.from('user_student_plan').select('*').eq('plan_id', planId).maybeSingle()
    if (data) return data
  }

  const { data: plans } = await db
    .from('user_student_plan')
    .select('*')
    .eq('student_user_id', studentId)
    .order('updated_at', { ascending: false })
    .limit(1)

  if (plans?.[0]) return plans[0]

  const { data: legacy } = await db
    .from('planning_records')
    .select('*')
    .eq('student_user_id', studentId)
    .order('created_at', { ascending: false })
    .limit(1)

  if (legacy?.[0]) {
    return {
      plan_id: String(legacy[0].id),
      student_user_id: studentId,
      student_name: legacy[0].student_name,
      plan_title: legacy[0].report_title || '教育规划',
      route_id: legacy[0].subject,
    }
  }

  return null
}

async function loadTasks(planId, studentId) {
  const db = admin()

  const { data: tasks } = await db
    .from('user_task_record')
    .select('*')
    .eq('plan_id', planId)
    .order('start_date', { ascending: true })

  if (tasks?.length) {
    return tasks.map((t) => ({
      taskId: t.task_id,
      taskName: t.task_name,
      stageName: t.stage_name || '综合',
      status: t.status || (t.complete_rate >= 100 ? 'finish' : 'unfinish'),
      subject: t.route_type || t.stage_name || '综合',
      updatedAt: t.updated_at,
      startDate: t.start_date,
    }))
  }

  const { data: progress } = await db
    .from('planning_task_progress')
    .select('*')
    .eq('plan_id', planId)
    .eq('student_user_id', studentId)

  if (progress?.length) {
    return progress.map((p) => ({
      taskId: p.task_key || p.id,
      taskName: p.task_name || p.task_key,
      stageName: `阶段${(p.phase_index ?? 0) + 1}`,
      status: p.completed ? 'finish' : 'unfinish',
      subject: `阶段${(p.phase_index ?? 0) + 1}`,
      updatedAt: p.updated_at,
      startDate: null,
    }))
  }

  return []
}

function buildSubjectBreakdown(tasks) {
  const map = {}
  for (const t of tasks) {
    const key = t.subject || t.stageName || '其他'
    if (!map[key]) map[key] = { total: 0, completed: 0 }
    map[key].total++
    if (t.status === 'finish') map[key].completed++
  }
  return Object.entries(map).map(([name, s]) => ({
    name,
    total: s.total,
    completed: s.completed,
    rate: s.total > 0 ? Math.round((s.completed / s.total) * 100) : 0,
  }))
}

function isFinished(status) {
  return status === 'finish'
}

export async function buildWeeklyReport({ studentId, planId, weekStart }) {
  if (!isSupabaseAdminConfigured()) throw new Error('Supabase 未配置')

  const sid = String(studentId || '').trim()
  if (!sid) throw new Error('缺少 studentId')

  const plan = await resolveStudentPlan(sid, planId?.trim())
  if (!plan) throw new Error('未找到该学生的教育规划，请先生成规划')

  const start = parseWeekStart(weekStart)
  const end = new Date(start)
  end.setDate(end.getDate() + 6)

  const allTasks = await loadTasks(plan.plan_id, sid)
  const total = allTasks.length
  const completed = allTasks.filter((t) => isFinished(t.status)).length
  const unfinished = allTasks.filter((t) => !isFinished(t.status) && t.status !== 'delay').length
  const delayed = allTasks.filter((t) => t.status === 'delay').length
  const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0

  const subjectBreakdown = buildSubjectBreakdown(allTasks)
  const warnings = subjectBreakdown
    .filter((s) => s.rate < 60 && s.total > 0)
    .map((s) => ({
      subject: s.name,
      rate: s.rate,
      message: `${s.name} 完成率仅 ${s.rate}%，属于薄弱环节，建议本周重点补强`,
    }))

  const unfinishedList = allTasks
    .filter((t) => !isFinished(t.status))
    .map((t) => ({
      taskId: t.taskId,
      taskName: t.taskName,
      status: t.status,
      stageName: t.stageName,
    }))

  return {
    studentId: sid,
    studentName: plan.student_name || '学生',
    planId: plan.plan_id,
    planTitle: plan.plan_title,
    totalTasks: total,
    completedTasks: completed,
    unfinishedTasks: unfinished,
    delayedTasks: delayed,
    completionRate,
    subjectBreakdown,
    timeComparison: { actual: completed * 45, planned: total * 30 },
    warnings,
    unfinishedList,
    weekRange: {
      start: start.toISOString().split('T')[0],
      end: end.toISOString().split('T')[0],
    },
  }
}

export async function buildMonthlyReport({ studentId, planId, month }) {
  if (!isSupabaseAdminConfigured()) throw new Error('Supabase 未配置')

  const sid = String(studentId || '').trim()
  if (!sid) throw new Error('缺少 studentId')

  const plan = await resolveStudentPlan(sid, planId?.trim())
  if (!plan) throw new Error('未找到该学生的教育规划')

  const targetMonth = parseMonth(month)
  const monthLabel = `${targetMonth.getFullYear()}-${String(targetMonth.getMonth() + 1).padStart(2, '0')}`

  const weekly = await buildWeeklyReport({ studentId: sid, planId: plan.plan_id })
  const allTasks = await loadTasks(plan.plan_id, sid)
  const total = allTasks.length
  const completed = allTasks.filter((t) => isFinished(t.status)).length
  const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0

  const stageProgress = weekly.subjectBreakdown.map((s) => ({
    stageName: s.name,
    total: s.total,
    completed: s.completed,
    rate: s.rate,
  }))

  const weeklyTrend = []
  for (let w = 0; w < 4; w++) {
    const ws = new Date(targetMonth)
    ws.setDate(1 + w * 7)
    const we = new Date(ws)
    we.setDate(ws.getDate() + 6)
    const weekTasks = allTasks.filter((t) => {
      if (!t.updatedAt) return w === 3
      const u = new Date(t.updatedAt)
      return u >= ws && u <= we
    })
    const wt = weekTasks.length || Math.max(1, Math.floor(total / 4))
    const wc = weekTasks.filter((t) => isFinished(t.status)).length
    weeklyTrend.push({
      weekLabel: `第${w + 1}周`,
      completed: wc,
      total: wt,
      rate: wt > 0 ? Math.round((wc / wt) * 100) : completionRate,
    })
  }

  const suggestions = [...weekly.warnings.map((w) => w.message)]
  const weak = stageProgress.filter((s) => s.rate < 50)
  if (weak.length) {
    suggestions.push(`下月优先攻克：${weak.map((s) => s.stageName).join('、')}`)
  }
  if (completionRate < 40) {
    suggestions.push('下月建议增加每日学习时长，并拆分大任务为可执行的周目标')
  } else if (completionRate >= 75) {
    suggestions.push('下月可进入下一阶段任务，并保持每周复盘习惯')
  }
  weekly.unfinishedList.slice(0, 5).forEach((t) => {
    suggestions.push(`下月重点任务：完成「${t.taskName}」`)
  })

  return {
    studentId: sid,
    studentName: plan.student_name || '学生',
    planId: plan.plan_id,
    planTitle: plan.plan_title,
    totalTasks: total,
    completedTasks: completed,
    completionRate,
    stageProgress,
    knowledgeCoverage: completionRate,
    standardMet: completed,
    standardTotal: total,
    suggestions: [...new Set(suggestions)].slice(0, 8),
    month: monthLabel,
    weeklyTrend,
    weeklySummary: weekly,
  }
}
