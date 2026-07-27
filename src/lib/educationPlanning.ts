/**
 * 教育规划系统 — 前端 API 调用封装
 *
 * 覆盖：7大路线获取、甘特数据、周报月报、家长绑定、规划CRUD
 * 规划报告生成（含霍兰德/五维 enrichment）见 ./fetchPlanning.ts
 */

export { fetchPlanningReport, PLANNING_API_PATH } from './fetchPlanning'

import type {
  PlanRoute, RouteDetail, StudentPlan, GanttData,
  WeeklyReport, MonthlyReport, TeacherOverview,
  ParentBinding, InviteCode, UserTaskRecord,
} from '../types/planning'

import { getTeacherApiBase } from './apiBase'

/** 家长绑定 API 优先走主站同源（Vercel /api/student、/api/parent） */
function getBindingApiBase(): string {
  const env = import.meta.env.VITE_BINDING_API_BASE?.replace(/\/$/, '')
  if (env) return env
  if (typeof window !== 'undefined') return window.location.origin
  return getTeacherApiBase()
}

async function bindingGet<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${getBindingApiBase()}${path}`)
  if (params) {
    Object.entries(params).forEach(([k, v]) => { if (v) url.searchParams.set(k, v) })
  }
  const r = await fetch(url.toString(), { headers: { 'Content-Type': 'application/json' } })
  return r.json()
}

async function bindingPost<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`${getBindingApiBase()}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return r.json()
}

async function apiGet<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${getTeacherApiBase()}${path}`)
  if (params) {
    Object.entries(params).forEach(([k, v]) => { if (v) url.searchParams.set(k, v) })
  }
  const finalUrl = url.toString()
  console.log('[educationPlanning] GET', { finalUrl })
  const r = await fetch(finalUrl, { headers: { 'Content-Type': 'application/json' } })
  return r.json()
}

async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const finalUrl = `${getTeacherApiBase()}${path}`
  console.log('[educationPlanning] POST', { finalUrl })
  const r = await fetch(finalUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return r.json()
}

// ============================================================
// 路线相关
// ============================================================

/** 获取全部升学路线 */
export async function fetchPlanRoutes(): Promise<{ success: boolean; routes: PlanRoute[] }> {
  return apiGet('/api/planning/routes')
}

/** 获取单条路线详情（含阶段+任务） */
export async function fetchRouteDetail(code: string): Promise<{ success: boolean; route: RouteDetail; message?: string }> {
  return apiGet(`/api/planning/routes/${code}`)
}

// ============================================================
// 学生规划 CRUD
// ============================================================

/** 创建/更新学生规划 */
export async function saveStudentPlan(data: Partial<StudentPlan> & { tasks?: UserTaskRecord[] }): Promise<{ success: boolean; plan_id?: string; message?: string }> {
  return apiPost('/api/planning/student-plan', data)
}

/** 查询学生规划列表 */
export async function fetchStudentPlans(params: { student_user_id?: string; creator_user_id?: string }): Promise<{ success: boolean; plans: StudentPlan[] }> {
  return apiGet('/api/planning/student-plan', params as Record<string, string>)
}

/** 获取甘特图数据 */
export async function fetchGanttData(planId: string): Promise<{ success: boolean; gantt: GanttData; message?: string }> {
  return apiGet(`/api/planning/gantt/${planId}`)
}

/** 更新任务进度 */
export async function updateTaskProgress(data: { task_id: string; complete_rate?: number; status?: string; notes?: string; user_id?: string }): Promise<{ success: boolean; message?: string }> {
  return apiPost('/api/planning/task-update', data)
}

// ============================================================
// 报表相关
// ============================================================

function getReportApiBase(): string {
  return getTeacherApiBase()
}

/** 获取周报（支持 studentId + weekStart，或兼容 plan_id） */
export async function fetchWeeklyReport(params: {
  studentId?: string
  student_id?: string
  plan_id?: string
  planId?: string
  weekStart?: string
  week_start?: string
}): Promise<{ success: boolean; report: WeeklyReport; message?: string }> {
  const q: Record<string, string> = {}
  const sid = params.studentId || params.student_id
  if (sid) q.studentId = sid
  if (params.plan_id || params.planId) q.planId = params.plan_id || params.planId || ''
  if (params.weekStart || params.week_start) q.weekStart = params.weekStart || params.week_start || ''
  const url = new URL(`${getReportApiBase()}/api/planning/weekly-report`)
  Object.entries(q).forEach(([k, v]) => { if (v) url.searchParams.set(k, v) })
  const finalUrl = url.toString()
  console.log('[educationPlanning] GET weekly-report', { finalUrl })
  const r = await fetch(finalUrl)
  return r.json()
}

/** 获取月报（支持 studentId + month，或兼容 plan_id） */
export async function fetchMonthlyReport(params: {
  studentId?: string
  student_id?: string
  plan_id?: string
  planId?: string
  month?: string
}): Promise<{ success: boolean; report: MonthlyReport; message?: string }> {
  const q: Record<string, string> = {}
  const sid = params.studentId || params.student_id
  if (sid) q.studentId = sid
  if (params.plan_id || params.planId) q.planId = params.plan_id || params.planId || ''
  if (params.month) q.month = params.month
  const url = new URL(`${getReportApiBase()}/api/planning/monthly-report`)
  Object.entries(q).forEach(([k, v]) => { if (v) url.searchParams.set(k, v) })
  const finalUrl = url.toString()
  console.log('[educationPlanning] GET monthly-report', { finalUrl })
  const r = await fetch(finalUrl)
  return r.json()
}

/** 获取教师端全班概览 */
export async function fetchTeacherOverview(teacherId?: string): Promise<{ success: boolean; students: TeacherOverview['students']; classAvgRate: number; weakStudents: TeacherOverview['weakStudents'] }> {
  return apiGet('/api/planning/teacher-overview', teacherId ? { teacher_id: teacherId } : {})
}

// ============================================================
// 家长绑定
// ============================================================

/** 学生生成邀请码 */
export async function generateInviteCode(studentUserId: string): Promise<{ success: boolean; code: string; expires_at: string; message?: string }> {
  const res = await bindingPost<{
    success: boolean
    inviteCode?: string
    code?: string
    expiresAt?: string
    expires_at?: string
    message?: string
  }>('/api/student/generate-invite-code', { studentId: studentUserId })
  return {
    success: res.success,
    code: res.code || res.inviteCode || '',
    expires_at: res.expires_at || res.expiresAt || '',
    message: res.message,
  }
}

/** 家长通过邀请码绑定 */
export async function bindParent(data: { parent_user_id: string; invite_code?: string; student_user_id?: string; bind_type?: string }): Promise<{ success: boolean; binding?: ParentBinding; message?: string }> {
  return bindingPost('/api/parent/bind', {
    parentId: data.parent_user_id,
    parent_user_id: data.parent_user_id,
    inviteCode: data.invite_code,
    invite_code: data.invite_code,
  })
}

/** 查询绑定关系 */
export async function fetchBindings(params: { user_id: string; role?: 'student' | 'parent' }): Promise<{ success: boolean; bindings: ParentBinding[] }> {
  return bindingGet('/api/parent/bindings', params as Record<string, string>)
}

/** 解绑 */
export async function unbindParent(bindingId: string): Promise<{ success: boolean; message?: string }> {
  return bindingPost('/api/parent/unbind', { binding_id: bindingId })
}

/** 教师批量绑定 */
export async function batchBind(bindings: Array<{ student_user_id: string; parent_user_id: string; student_name?: string }>): Promise<{ success: boolean; message?: string }> {
  return apiPost('/api/parent/batch-bind', { bindings })
}

/** 家长端查看学生数据 */
export async function fetchParentStudentView(params: { parent_user_id: string; student_user_id: string }): Promise<{ success: boolean; data: { student_user_id: string; plans: StudentPlan[]; tasks: UserTaskRecord[]; viewMode: string }; message?: string }> {
  return apiGet('/api/parent/student-view', params as Record<string, string>)
}
