import { useRef, useState, useEffect, useCallback } from 'react'
import DashboardHeader from '../components/layout/DashboardHeader'
import PlanningInputPanel from '../components/planning/PlanningInputPanel'
import PlanningPreviewPanel from '../components/planning/PlanningPreviewPanel'
import PlanningReportView from '../components/planning/PlanningReportView'
import GanttChart from '../components/planning/GanttChart'
import WeeklyReportCard from '../components/planning/WeeklyReportCard'
import MonthlyReportCard from '../components/planning/MonthlyReportCard'
import ParentBindingPanel from '../components/planning/ParentBindingPanel'
import { useAuth } from '../context/AuthContext'
import { exportToPdf } from '../lib/exportPdf'
import { fetchPlanningReport } from '../lib/fetchPlanning'
import { savePlanningRecord } from '../lib/planningStorage'
import {
  fetchTeacherOverview, fetchPlanRoutes, fetchGanttData,
  fetchWeeklyReport, fetchMonthlyReport,
} from '../lib/educationPlanning'
import type {
  PlanningFormData, PlanningReport, PlanRoute, GanttData,
  WeeklyReport as WeeklyReportType, MonthlyReport as MonthlyReportType,
  TeacherStudentItem, PlanRouteCode,
} from '../types/planning'

type Tab = 'create' | 'overview' | 'detail' | 'reports' | 'binding'

const defaultForm: PlanningFormData = {
  studentName: '',
  grade: '初二',
  goalDirections: ['中考'],
  scoreLevel: '良好',
  interests: ['数学', '物理'],
  parentExpectations: '希望冲击重点高中，同时保持学习兴趣和身心健康。',
  specialNotes: '',
  createdByRole: 'teacher',
}

export default function TeacherPlanningPage() {
  const { profile } = useAuth()
  const reportRef = useRef<HTMLDivElement>(null)

  const [tab, setTab] = useState<Tab>('create')
  const [form, setForm] = useState<PlanningFormData>(defaultForm)
  const [report, setReport] = useState<PlanningReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [isWarning, setIsWarning] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // 新系统状态
  const [routes, setRoutes] = useState<PlanRoute[]>([])
  const [overviewStudents, setOverviewStudents] = useState<TeacherStudentItem[]>([])
  const [classAvgRate, setClassAvgRate] = useState(0)
  const [weakStudents, setWeakStudents] = useState<{ studentName: string; progressPercent: number; planTitle: string }[]>([])
  const [ganttData, setGanttData] = useState<GanttData | null>(null)
  const [weeklyReport, setWeeklyReport] = useState<WeeklyReportType | null>(null)
  const [monthlyReport, setMonthlyReport] = useState<MonthlyReportType | null>(null)
  const [selectedStudentPlanId, setSelectedStudentPlanId] = useState<string | null>(null)

  useEffect(() => {
    fetchPlanRoutes().then((r) => { if (r.success) setRoutes(r.routes) }).catch(() => {})
  }, [])

  const loadOverview = useCallback(async () => {
    if (!profile?.id) return
    try {
      const res = await fetchTeacherOverview(profile.id)
      if (res.success) {
        setOverviewStudents(res.students || [])
        setClassAvgRate(res.classAvgRate)
        setWeakStudents(res.weakStudents || [])
      }
    } catch { /* 静默 */ }
  }, [profile?.id])

  useEffect(() => {
    if (tab === 'overview') loadOverview()
  }, [tab, loadOverview])

  const loadStudentDetail = useCallback(async (student: TeacherStudentItem) => {
    setSelectedStudentPlanId(student.planId)
    setTab('detail')
    try {
      const [ganttRes, weeklyRes, monthlyRes] = await Promise.all([
        fetchGanttData(student.planId),
        fetchWeeklyReport({ studentId: student.studentId, planId: student.planId }),
        fetchMonthlyReport({ studentId: student.studentId, planId: student.planId }),
      ])
      if (ganttRes.success) setGanttData(ganttRes.gantt)
      if (weeklyRes.success) setWeeklyReport(weeklyRes.report)
      if (monthlyRes.success) setMonthlyReport(monthlyRes.report)
    } catch { /* 静默 */ }
  }, [])

  const handleGenerate = async () => {
    if (!form.studentName.trim()) { setMessage('请填写学生姓名'); setIsWarning(true); return }
    setLoading(true)
    setMessage(null)
    setIsWarning(false)
    setSaved(false)
    try {
      const payload = { ...form, createdByRole: 'teacher' as const }
      const data = await fetchPlanningReport(payload)
      setReport(data.report!)
      setIsWarning(!!data.isMockFallback)
      setMessage(data.message ?? '教育规划方案生成成功')
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '规划方案生成失败')
      setIsWarning(true)
    } finally { setLoading(false) }
  }

  const handleExportPdf = async () => {
    const el = reportRef.current ?? document.getElementById('planning-report-content')
    if (!el || !report) return
    setExporting(true)
    try { await exportToPdf(el as HTMLElement, `${report.title}.pdf`) }
    catch { setMessage('PDF 导出失败'); setIsWarning(true) }
    finally { setExporting(false) }
  }

  const handleSave = () => {
    if (!report) return
    setSaving(true)
    try {
      savePlanningRecord({ form: { ...form, createdByRole: 'teacher' }, report, createdBy: 'teacher', creatorUserId: profile?.id })
      setSaved(true)
      setMessage('规划方案已保存，学生可在学生端查看')
      setIsWarning(false)
    } finally { setSaving(false) }
  }

  return (
    <div className="min-h-screen bg-[#121722] text-[#E8ECF3]">
      <DashboardHeader title="AI教育规划 · 教师工作台" featureNavRole="teacher" />

      <main className="mx-auto max-w-[1600px] px-4 py-4 sm:px-6 sm:py-6">
        {/* Tab 导航 */}
        <div className="mb-6 flex flex-wrap gap-2">
          <TabBtn active={tab === 'create'} onClick={() => setTab('create')}>新建规划</TabBtn>
          <TabBtn active={tab === 'overview'} onClick={() => { setTab('overview'); loadOverview() }}>全班概览</TabBtn>
          {selectedStudentPlanId && (
            <TabBtn active={tab === 'detail'} onClick={() => setTab('detail')}>学生详情</TabBtn>
          )}
          <TabBtn active={tab === 'reports'} onClick={() => setTab('reports')}>报表中心</TabBtn>
          <TabBtn active={tab === 'binding'} onClick={() => setTab('binding')}>家校管理</TabBtn>
        </div>

        {/* Tab: 创建规划 */}
        {tab === 'create' && (
          <div className="flex flex-col gap-6 lg:flex-row lg:items-stretch">
            <div className="w-full lg:w-[40%] lg:shrink-0">
              <PlanningInputPanel form={form} loading={loading} onChange={setForm} onGenerate={handleGenerate} />
            </div>
            <div className="w-full lg:w-[60%]">
              <PlanningPreviewPanel
                report={report} loading={loading} message={message} isWarning={isWarning}
                reportRef={reportRef} onExportPdf={handleExportPdf} onSave={handleSave}
                exporting={exporting} saving={saving} saved={saved}
              />
            </div>
          </div>
        )}

        {/* Tab: 全班概览 */}
        {tab === 'overview' && (
          <div className="space-y-6">
            {/* 班级总览卡片 */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <OverviewCard label="学生总数" value={overviewStudents.length} color="text-[#2584FF]" />
              <OverviewCard label="班级平均完成率" value={`${classAvgRate}%`} color="text-[#22C55E]" />
              <OverviewCard label="薄弱学生" value={weakStudents.length} color="text-[#EF4444]" warn={weakStudents.length > 0} />
            </div>

            {/* 薄弱学生预警 */}
            {weakStudents.length > 0 && (
              <div className="rounded-[12px] border border-[#EF4444]/20 bg-[#EF4444]/10 p-4">
                <h3 className="mb-2 text-sm font-semibold text-[#EF4444]">需要重点关注的学生</h3>
                {weakStudents.map((w, i) => (
                  <div key={i} className="mb-1 flex items-center justify-between rounded-[8px] bg-[#1C2332] px-3 py-2">
                    <div>
                      <span className="text-sm text-[#E8ECF3]">{w.studentName}</span>
                      <span className="ml-2 text-xs text-[#8A94A9]">{w.planTitle}</span>
                    </div>
                    <span className="rounded-full bg-[#EF4444]/20 px-2 py-0.5 text-xs text-[#EF4444]">{w.progressPercent}%</span>
                  </div>
                ))}
              </div>
            )}

            {/* 学生列表 */}
            {overviewStudents.length > 0 ? (
              <div className="rounded-[12px] border border-white/[0.06] bg-[#1C2332] p-5">
                <h3 className="mb-3 text-sm font-semibold text-[#E8ECF3]">全班学生规划执行情况</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-white/[0.06] text-left text-[#8A94A9]">
                        <th className="pb-2 pr-4 font-medium">学生</th>
                        <th className="pb-2 pr-4 font-medium">规划标题</th>
                        <th className="pb-2 pr-4 font-medium">路线</th>
                        <th className="pb-2 pr-4 font-medium text-center">任务完成</th>
                        <th className="pb-2 pr-4 font-medium text-center">进度</th>
                        <th className="pb-2 font-medium">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {overviewStudents.map((s) => (
                        <tr key={s.planId} className="border-b border-white/[0.04] hover:bg-white/[0.03]">
                          <td className="py-2 pr-4 text-[#E8ECF3]">{s.studentName}</td>
                          <td className="py-2 pr-4 text-[#8A94A9] max-w-[200px] truncate">{s.planTitle}</td>
                          <td className="py-2 pr-4">
                            <span className="rounded-full bg-white/[0.05] px-2 py-0.5 text-[10px] text-[#8A94A9]">
                              {routes.find((r) => r.route_code === s.routeName)?.route_name || s.routeName}
                            </span>
                          </td>
                          <td className="py-2 pr-4 text-center text-[#E8ECF3]">
                            {s.completedTasks}/{s.totalTasks}
                          </td>
                          <td className="py-2 pr-4 text-center">
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 w-20 overflow-hidden rounded-full bg-white/[0.06]">
                                <div
                                  className={`h-full rounded-full ${s.progressPercent >= 60 ? 'bg-[#22C55E]' : s.progressPercent >= 30 ? 'bg-[#F59E0B]' : 'bg-[#EF4444]'}`}
                                  style={{ width: `${s.progressPercent}%` }}
                                />
                              </div>
                              <span className={s.progressPercent < 40 ? 'text-[#EF4444]' : 'text-[#8A94A9]'}>
                                {s.progressPercent}%
                              </span>
                            </div>
                          </td>
                          <td className="py-2">
                            <button
                              type="button" onClick={() => loadStudentDetail(s)}
                              className="rounded-[6px] border border-[#2584FF]/30 px-2 py-0.5 text-[10px] text-[#2584FF] hover:bg-[#2584FF]/10"
                            >
                              查看
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center rounded-[12px] border border-white/[0.06] bg-[#1C2332] p-12 text-center">
                <p className="text-sm text-[#8A94A9]">暂无学生规划数据</p>
                <p className="mt-2 text-xs text-[#8A94A9]">请先为学生生成规划方案</p>
                <button
                  type="button"
                  onClick={() => setTab('create')}
                  className="mt-4 inline-flex items-center rounded-[8px] bg-[#2584FF] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0F70E8]"
                >
                  去创建规划
                </button>
              </div>
            )}
          </div>
        )}

        {/* Tab: 学生详情 */}
        {tab === 'detail' && (
          <div className="space-y-6">
            {ganttData ? (
              <>
                <GanttChart ganttData={ganttData} readOnly={false}
                  onTaskClick={(taskId) => console.log('Edit task:', taskId)} />
                {weeklyReport && <WeeklyReportCard report={weeklyReport} role="teacher" onEditTask={(id) => console.log('Edit:', id)} />}
                {monthlyReport && <MonthlyReportCard report={monthlyReport} role="teacher" />}
              </>
            ) : (
              <div className="flex items-center justify-center rounded-[12px] border border-white/[0.06] bg-[#1C2332] p-12 text-sm text-[#8A94A9]">
                加载中…
              </div>
            )}
          </div>
        )}

        {/* Tab: 报表中心 */}
        {tab === 'reports' && (
          <div className="space-y-6">
            {weeklyReport ? (
              <WeeklyReportCard report={weeklyReport} role="teacher" />
            ) : (
              <div className="flex flex-col items-center justify-center rounded-[12px] border border-white/[0.06] bg-[#1C2332] p-12 text-center">
                <p className="text-sm text-[#8A94A9]">请先从全班概览中选择学生查看报表</p>
                <button
                  type="button"
                  onClick={() => setTab('overview')}
                  className="mt-4 inline-flex items-center rounded-[8px] bg-[#2584FF] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0F70E8]"
                >
                  前往全班概览
                </button>
              </div>
            )}
            {monthlyReport && <MonthlyReportCard report={monthlyReport} role="teacher" />}
          </div>
        )}

        {/* Tab: 家校管理 */}
        {tab === 'binding' && profile?.id && (
          <div className="mx-auto max-w-lg">
            <ParentBindingPanel userId={profile.id} role="teacher" />
          </div>
        )}
      </main>
    </div>
  )
}

function OverviewCard({ label, value, color, warn }: { label: string; value: string | number; color: string; warn?: boolean }) {
  return (
    <div className={`rounded-[12px] border p-5 text-center ${warn ? 'border-[#EF4444]/30 bg-[#EF4444]/5' : 'border-white/[0.06] bg-[#1C2332]'}`}>
      <p className={`text-3xl font-bold ${color}`}>{value}</p>
      <p className="mt-1 text-xs text-[#8A94A9]">{label}</p>
    </div>
  )
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-[10px] px-4 py-2 text-sm font-medium transition ${
        active
          ? 'bg-[#2584FF] text-white'
          : 'bg-[#1C2332] text-[#8A94A9] hover:text-[#E8ECF3] hover:bg-[#222B3E]'
      }`}
    >
      {children}
    </button>
  )
}
