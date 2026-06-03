import { useMemo, useRef, useState, useCallback, type ReactNode, useEffect } from 'react'
import DashboardHeader from '../components/layout/DashboardHeader'
import PlanningInputPanel from '../components/planning/PlanningInputPanel'
import PlanningPreviewPanel from '../components/planning/PlanningPreviewPanel'
import PlanningReportView from '../components/planning/PlanningReportView'
import GanttChart from '../components/planning/GanttChart'
import ProgressChecklist from '../components/planning/ProgressChecklist'
import WeeklyReportCard from '../components/planning/WeeklyReportCard'
import MonthlyReportCard from '../components/planning/MonthlyReportCard'
import ParentBindingPanel from '../components/planning/ParentBindingPanel'
import { printPlanningReport } from '../components/planning/PlanPrintView'
import { useAuth } from '../context/AuthContext'
import { exportToPdf } from '../lib/exportPdf'
import { fetchPlanningReport } from '../lib/fetchPlanning'
import { getStudentPlanningRecords, savePlanningRecord } from '../lib/planningStorage'
import {
  fetchPlanRoutes, fetchRouteDetail, fetchStudentPlans,
  fetchGanttData, updateTaskProgress as apiUpdateTask,
  fetchWeeklyReport, fetchMonthlyReport, saveStudentPlan,
} from '../lib/educationPlanning'
import type {
  PlanningFormData, PlanningReport, SavedPlanningRecord,
  GanttTask, PlanningTaskProgress, PlanRoute, RouteDetail,
  GanttData, WeeklyReport as WeeklyReportType, MonthlyReport as MonthlyReportType,
  PlanRouteCode,
} from '../types/planning'

const API_BASE = 'https://api.huqiyunshiai.online'

type Tab = 'create' | 'records' | 'reports' | 'binding'

const defaultForm = (name: string): PlanningFormData => ({
  studentName: name,
  grade: '初二',
  goalDirections: ['中考'],
  scoreLevel: '良好',
  interests: ['数学'],
  parentExpectations: '',
  specialNotes: '',
  createdByRole: 'student',
})

export default function StudentPlanningPage() {
  const { profile } = useAuth()
  const reportRef = useRef<HTMLDivElement>(null)
  const displayName = profile?.phone?.slice(-4) ? `同学${profile.phone.slice(-4)}` : '我'

  const [tab, setTab] = useState<Tab>('create')
  const [form, setForm] = useState<PlanningFormData>(() => defaultForm(displayName))
  const [report, setReport] = useState<PlanningReport | null>(null)
  const [selectedRecord, setSelectedRecord] = useState<SavedPlanningRecord | null>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [isWarning, setIsWarning] = useState(false)
  const [exporting, setExporting] = useState(false)

  // 新版教育规划系统状态
  const [routes, setRoutes] = useState<PlanRoute[]>([])
  const [selectedRouteCode, setSelectedRouteCode] = useState<PlanRouteCode | ''>('')
  const [routeDetail, setRouteDetail] = useState<RouteDetail | null>(null)
  const [ganttData, setGanttData] = useState<GanttData | null>(null)
  const [weeklyReport, setWeeklyReport] = useState<WeeklyReportType | null>(null)
  const [monthlyReport, setMonthlyReport] = useState<MonthlyReportType | null>(null)
  const [currentPlanId, setCurrentPlanId] = useState<string | null>(null)
  const [planStartDate, setPlanStartDate] = useState(() => new Date().toISOString().split('T')[0])

  // 甘特图 & 进度跟踪
  const [checklistProgress, setChecklistProgress] = useState<Record<string, boolean>>({})
  const [supabaseProgress, setSupabaseProgress] = useState<PlanningTaskProgress[]>([])

  // 加载路线列表
  useEffect(() => {
    fetchPlanRoutes().then((res) => { if (res.success) setRoutes(res.routes) }).catch(() => {})
  }, [])

  /** 从教育规划报告中构建甘特图任务（兼容旧格式） */
  const ganttTasks = useMemo<GanttTask[] | undefined>(() => {
    const activeReport = selectedRecord?.report ?? report
    if (!activeReport?.phaseTasks?.length) return undefined

    const colors = ['#22d3ee', '#a78bfa', '#f472b6', '#34d399', '#fbbf24', '#60a5fa']
    const now = new Date()
    const tasks: GanttTask[] = []

    activeReport.phaseTasks.forEach((phase, pi) => {
      const phaseTasks = phase.tasks || []
      const phaseStart = new Date(now)
      phaseStart.setDate(phaseStart.getDate() + pi * (activeReport.phaseTasks[0]?.days || 30))
      const phaseEnd = new Date(phaseStart)
      phaseEnd.setDate(phaseEnd.getDate() + (phase.days || 30))

      phaseTasks.forEach((task, ti) => {
        const key = `${pi}_${ti}`
        tasks.push({
          id: `${activeReport.title}_${key}`,
          name: task,
          phase: phase.phase || `阶段${pi + 1}`,
          startDate: phaseStart.toISOString().split('T')[0],
          endDate: phaseEnd.toISOString().split('T')[0],
          completed: !!checklistProgress[key],
          color: colors[pi % colors.length],
        })
      })
    })
    return tasks
  }, [report, selectedRecord, checklistProgress])

  /** 加载路线详情并创建规划 */
  const handleSelectRoute = useCallback(async (code: PlanRouteCode) => {
    setSelectedRouteCode(code)
    setLoading(true)
    try {
      const res = await fetchRouteDetail(code)
      if (res.success) {
        setRouteDetail(res.route)
        // 基于模板任务创建规划
        const allTasks = res.route.stages.flatMap((s) =>
          (s.tasks || []).map((t) => ({
            task_name: t.task_name,
            temp_id: t.task_temp_id,
            route_type: res.route.route_code,
            stage_name: s.stage_name,
            start_date: null as string | null,
            end_date: null as string | null,
            task_days: 0,
            is_parallel: t.is_parallel,
            pre_task_id: t.pre_task_id || '',
            complete_rate: 0,
            status: 'unfinish' as const,
          }))
        )

        if (profile?.id && planStartDate) {
          // 计算任务日期
          const start = new Date(planStartDate)
          let currentDate = new Date(start)
          const taskWithDates = allTasks.map((t) => {
            const days = 30 // 默认30天
            t.start_date = currentDate.toISOString().split('T')[0]
            const end = new Date(currentDate)
            end.setDate(end.getDate() + days)
            t.end_date = end.toISOString().split('T')[0]
            t.task_days = days
            if (!t.is_parallel) currentDate = new Date(end)
            return t
          })

          const planRes = await saveStudentPlan({
            student_user_id: profile.id,
            student_name: displayName,
            route_id: code,
            plan_title: `${res.route.route_name}`,
            plan_start_date: planStartDate,
            creator_user_id: profile.id,
            created_by: 'student',
            tasks: taskWithDates as unknown as import('../types/planning').UserTaskRecord[],
          })

          if (planRes.success && planRes.plan_id) {
            setCurrentPlanId(planRes.plan_id)
            setMessage(`规划「${res.route.route_name}」创建成功`)
            setTab('records')
            loadGanttAndReports(planRes.plan_id)
          }
        }
      } else {
        setMessage(res.message || '加载路线失败')
        setIsWarning(true)
      }
    } catch {
      setMessage('网络错误')
      setIsWarning(true)
    } finally {
      setLoading(false)
    }
  }, [profile?.id, displayName, planStartDate])

  /** 加载甘特图和周报月报 */
  const loadGanttAndReports = useCallback(async (planId: string) => {
    try {
      const [ganttRes, weeklyRes, monthlyRes] = await Promise.all([
        fetchGanttData(planId),
        fetchWeeklyReport({ plan_id: planId }),
        fetchMonthlyReport({ plan_id: planId }),
      ])
      if (ganttRes.success) setGanttData(ganttRes.gantt)
      if (weeklyRes.success) setWeeklyReport(weeklyRes.report)
      if (monthlyRes.success) setMonthlyReport(monthlyRes.report)
    } catch { /* 静默失败 */ }
  }, [])

  /** 从 Supabase 加载规划进度 */
  const loadPlanProgress = useCallback(async (planRecord: SavedPlanningRecord) => {
    if (!profile?.id) return
    try {
      const r = await fetch(`${API_BASE}/api/student/planning-progress?planId=${planRecord.id}&userId=${profile.id}`)
      const d = await r.json()
      if (d.success && d.progress?.length) {
        setSupabaseProgress(d.progress)
        const progressMap: Record<string, boolean> = {}
        d.progress.forEach((p: PlanningTaskProgress) => {
          if (p.completed) progressMap[`${p.phaseIndex}_${p.taskIndex}`] = true
        })
        setChecklistProgress((prev) => ({ ...prev, ...progressMap }))
      }
    } catch { /* 静默 */ }
  }, [profile?.id])

  /** 勾选/取消勾选任务进度，同步到 Supabase */
  const handleChecklistToggle = useCallback(async (phaseIndex: number, taskIndex: number) => {
    const activeReport = selectedRecord?.report ?? report
    const planId = selectedRecord?.id ?? report?.title ?? ''
    const key = `${phaseIndex}_${taskIndex}`
    const newCompleted = !checklistProgress[key]

    setChecklistProgress((p) => ({ ...p, [key]: newCompleted }))

    if (!planId || !profile?.id) return
    try {
      const taskName = activeReport?.phaseTasks?.[phaseIndex]?.tasks?.[taskIndex] || ''
      await fetch(`${API_BASE}/api/student/planning-progress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId, userId: profile.id, phaseIndex, taskIndex, taskName, completed: newCompleted }),
      })
    } catch {
      setChecklistProgress((p) => ({ ...p, [key]: !newCompleted }))
    }
  }, [checklistProgress, selectedRecord, report, profile?.id])

  const handleGanttToggle = useCallback(async (taskId: string) => {
    const match = taskId.match(/_(\d+)_(\d+)$/)
    if (match) handleChecklistToggle(parseInt(match[1]), parseInt(match[2]))
  }, [handleChecklistToggle])

  const records = useMemo(
    () => getStudentPlanningRecords(form.studentName || displayName, profile?.id),
    [form.studentName, displayName, profile?.id, report, selectedRecord],
  )

  const handleGenerate = async () => {
    setLoading(true)
    setMessage(null)
    setIsWarning(false)
    setSelectedRecord(null)
    try {
      const payload = { ...form, studentName: form.studentName || displayName, createdByRole: 'student' as const }
      const data = await fetchPlanningReport(payload)
      setReport(data.report!)
      setIsWarning(!!data.isMockFallback)
      setMessage(data.message ?? '教育规划方案生成成功')
      savePlanningRecord({ form: payload, report: data.report!, createdBy: 'student', creatorUserId: profile?.id, studentUserId: profile?.id })
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '规划方案生成失败')
      setIsWarning(true)
    } finally {
      setLoading(false)
    }
  }

  const handleExportPdf = async () => {
    const el = reportRef.current ?? document.getElementById('planning-report-content')
    const activeReport = selectedRecord?.report ?? report
    if (!el || !activeReport) return
    setExporting(true)
    try { await exportToPdf(el as HTMLElement, `${activeReport.title}.pdf`) }
    catch { setMessage('PDF 导出失败'); setIsWarning(true) }
    finally { setExporting(false) }
  }

  const viewRecord = (record: SavedPlanningRecord) => {
    setSelectedRecord(record)
    setReport(null)
    setTab('records')
    setMessage(null)
    loadPlanProgress(record)
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <DashboardHeader title="AI教育规划" backTo="/student/dashboard" backLabel="返回学习中心" featureNavRole="student" />

      <main className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-6 flex gap-2">
          <TabButton active={tab === 'create'} onClick={() => { setTab('create'); setSelectedRecord(null) }}>
            新建我的规划
          </TabButton>
          <TabButton active={tab === 'records'} onClick={() => setTab('records')}>
            我的规划记录
            {records.length > 0 && <span className="ml-1 rounded-full bg-blue-500/30 px-1.5 text-xs">{records.length}</span>}
          </TabButton>
          <TabButton active={tab === 'reports'} onClick={() => setTab('reports')}>
            学习报表
          </TabButton>
          <TabButton active={tab === 'binding'} onClick={() => setTab('binding')}>
            家校绑定
          </TabButton>
        </div>

        {/* Tab: 新建 */}
        {tab === 'create' && (
          <div className="flex flex-col gap-6 lg:flex-row lg:items-stretch">
            <div className="w-full lg:w-[40%] lg:shrink-0">
              <PlanningInputPanel form={form} loading={loading} onChange={setForm} onGenerate={handleGenerate} showStudentName />
            </div>
            <div className="w-full lg:w-[60%]">
              <PlanningPreviewPanel
                report={report} loading={loading} message={message} isWarning={isWarning}
                reportRef={reportRef} onExportPdf={handleExportPdf} exporting={exporting}
                ganttTasks={ganttTasks} checklistProgress={checklistProgress}
                onChecklistToggle={handleChecklistToggle} onGanttToggle={handleGanttToggle}
              />
            </div>
          </div>
        )}

        {/* Tab: 记录 */}
        {tab === 'records' && (
          <div className="flex flex-col gap-6 lg:flex-row">
            <div className="w-full space-y-3 lg:w-[35%]">
              <h2 className="text-sm font-medium text-slate-400">包含您自行创建及教师为您生成的方案</h2>

              {/* 7大路线快捷选择 */}
              <div className="rounded-2xl border border-blue-500/20 bg-slate-900/60 p-4">
                <h3 className="mb-2 text-xs font-semibold text-slate-400">升学路线模板</h3>
                <div className="space-y-2">
                  {routes.map((route) => (
                    <div key={route.route_id} className="flex items-center justify-between">
                      <div className="min-w-0">
                        <p className="text-xs text-slate-300">{route.route_name}</p>
                        <p className="text-[10px] text-slate-600">{route.route_desc}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleSelectRoute(route.route_code as PlanRouteCode)}
                        disabled={loading}
                        className="ml-2 shrink-0 rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-xs text-blue-200 hover:bg-blue-500/20 disabled:opacity-50"
                      >
                        选择
                      </button>
                    </div>
                  ))}
                </div>
                {planStartDate && (
                  <div className="mt-3">
                    <label className="text-[10px] text-slate-500">规划起始日期</label>
                    <input
                      type="date" value={planStartDate}
                      onChange={(e) => setPlanStartDate(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-1.5 text-xs text-white outline-none"
                    />
                  </div>
                )}
              </div>

              {/* 已有记录 */}
              {records.length === 0 ? (
                <div className="rounded-2xl border border-blue-500/20 bg-slate-900/60 p-8 text-center text-sm text-slate-500">
                  暂无规划记录，请先新建规划或请教师为您生成
                </div>
              ) : (
                records.map((r) => (
                  <div key={r.id}
                    className={`w-full rounded-xl border p-4 text-left transition ${
                      selectedRecord?.id === r.id ? 'border-cyan-400/50 bg-cyan-500/10' : 'border-slate-700/50 bg-slate-900/60 hover:border-blue-500/30'
                    }`}>
                    <button type="button" onClick={() => viewRecord(r)} className="w-full text-left">
                      <p className="font-medium text-blue-100">{r.report.title}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {r.createdBy === 'teacher' ? '教师生成' : '自行创建'} · {new Date(r.createdAt).toLocaleDateString('zh-CN')}
                      </p>
                    </button>
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); viewRecord(r) }}
                        className="flex-1 rounded-lg border border-cyan-500/20 px-2 py-1.5 text-xs text-cyan-200 hover:bg-cyan-500/10"
                      >
                        查看详情
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); printPlanningReport(r, checklistProgress) }}
                        className="flex-1 rounded-lg bg-green-600/20 border border-green-500/30 px-2 py-1.5 text-xs text-green-200 hover:bg-green-600/30"
                      >
                        导出PDF
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="w-full lg:w-[65%]">
              {selectedRecord ? (
                <div className="rounded-2xl border border-blue-500/20 bg-slate-900/60 p-5 sm:p-6">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h2 className="text-lg font-semibold text-blue-100">{selectedRecord.report.title}</h2>
                      <p className="text-xs text-slate-500">
                        {selectedRecord.createdBy === 'teacher' ? '教师为您生成' : '您自行创建'} · {new Date(selectedRecord.createdAt).toLocaleString('zh-CN')}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => { if (selectedRecord) printPlanningReport(selectedRecord, checklistProgress) }}
                        className="rounded-lg bg-green-600/20 border border-green-500/30 px-3 py-1.5 text-xs text-green-200 hover:bg-green-600/30"
                      >
                        导出PDF
                      </button>
                      <button type="button" onClick={handleExportPdf} disabled={exporting}
                        className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-xs text-cyan-200">
                        {exporting ? '导出中…' : '截图导出'}
                      </button>
                    </div>
                  </div>
                  <div className="max-h-[calc(100vh-220px)] overflow-y-auto">
                    <PlanningReportView
                      report={selectedRecord.report} reportRef={reportRef}
                      ganttTasks={ganttTasks} checklistProgress={checklistProgress}
                      onChecklistToggle={handleChecklistToggle}
                      supabaseProgress={supabaseProgress} onGanttToggle={handleGanttToggle}
                    />
                  </div>
                </div>
              ) : (
                <div className="flex min-h-[320px] items-center justify-center rounded-2xl border border-blue-500/20 bg-slate-900/60 p-8 text-center text-slate-500">
                  请从左侧选择一条规划记录查看，或选择升学路线模板快速创建
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab: 报表 */}
        {tab === 'reports' && (
          <div className="space-y-6">
            {weeklyReport ? (
              <WeeklyReportCard report={weeklyReport} role="student" />
            ) : (
              <div className="rounded-2xl border border-blue-500/20 bg-slate-900/60 p-8 text-center text-sm text-slate-500">
                暂无周报数据。请先创建规划并开始执行任务，系统将自动生成每周报表。
              </div>
            )}
            {monthlyReport && (
              <MonthlyReportCard report={monthlyReport} role="student" />
            )}
          </div>
        )}

        {/* Tab: 家校绑定 */}
        {tab === 'binding' && profile?.id && (
          <div className="mx-auto max-w-lg">
            <ParentBindingPanel userId={profile.id} role="student" />
          </div>
        )}
      </main>
    </div>
  )
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
        active ? 'bg-blue-500/20 text-cyan-300' : 'bg-slate-800/60 text-slate-400 hover:text-blue-200'
      }`}>
      {children}
    </button>
  )
}
