import { useState, useEffect } from 'react'
import DashboardHeader from '../components/layout/DashboardHeader'
import GanttChart from '../components/planning/GanttChart'
import WeeklyReportCard from '../components/planning/WeeklyReportCard'
import MonthlyReportCard from '../components/planning/MonthlyReportCard'
import ParentBindingPanel from '../components/planning/ParentBindingPanel'
import { useAuth } from '../context/AuthContext'
import {
  fetchBindings, fetchParentStudentView, fetchGanttData,
  fetchWeeklyReport, fetchMonthlyReport,
} from '../lib/educationPlanning'
import type {
  GanttData, WeeklyReport as WeeklyReportType, MonthlyReport as MonthlyReportType,
  ParentBinding, StudentPlan,
} from '../types/planning'

export default function ParentDashboardPage() {
  const { profile } = useAuth()

  const [bindings, setBindings] = useState<ParentBinding[]>([])
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null)
  const [plans, setPlans] = useState<StudentPlan[]>([])
  const [ganttData, setGanttData] = useState<GanttData | null>(null)
  const [weeklyReport, setWeeklyReport] = useState<WeeklyReportType | null>(null)
  const [monthlyReport, setMonthlyReport] = useState<MonthlyReportType | null>(null)
  const [loading, setLoading] = useState(false)

  // 加载绑定关系
  useEffect(() => {
    if (!profile?.id) return
    fetchBindings({ user_id: profile.id, role: 'parent' }).then((res) => {
      if (res.success) setBindings(res.bindings.filter(b => b.status === 'active'))
    }).catch(() => {})
  }, [profile?.id])

  // 选择学生后加载数据
  const handleSelectStudent = async (studentId: string) => {
    setSelectedStudentId(studentId)
    setLoading(true)
    try {
      if (!profile?.id) return
      const res = await fetchParentStudentView({ parent_user_id: profile.id, student_user_id: studentId })
      if (res.success) {
        setPlans(res.data.plans || [])
        if (res.data.plans?.[0]?.plan_id) {
          const planId = res.data.plans[0].plan_id
          const [gantt, weekly, monthly] = await Promise.all([
            fetchGanttData(planId),
            fetchWeeklyReport({ plan_id: planId }),
            fetchMonthlyReport({ plan_id: planId }),
          ])
          if (gantt.success) setGanttData(gantt.gantt)
          if (weekly.success) setWeeklyReport(weekly.report)
          if (monthly.success) setMonthlyReport(monthly.report)
        }
      }
    } catch { /* 静默 */ }
    finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <DashboardHeader title="家长中心 · 学习监控" featureNavRole="student" />

      <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 sm:py-8">
        {/* 绑定提示 */}
        {bindings.length === 0 && (
          <div className="mx-auto max-w-md space-y-6">
            <div className="rounded-2xl border border-blue-500/20 bg-slate-900/60 p-8 text-center">
              <div className="mb-4 text-4xl">👨‍👩‍👧</div>
              <h2 className="mb-2 text-lg font-semibold text-blue-100">欢迎使用家校互联</h2>
              <p className="mb-4 text-sm text-slate-400">
                绑定学生账号后，即可查看学习进展、规划执行情况和学习报表
              </p>
            </div>
            {profile?.id && <ParentBindingPanel userId={profile.id} role="parent" />}
          </div>
        )}

        {/* 学生选择器 */}
        {bindings.length > 0 && (
          <>
            <div className="mb-6 flex flex-wrap gap-2">
              {bindings.map((b) => (
                <button
                  key={b.id} type="button"
                  onClick={() => handleSelectStudent(b.student_user_id)}
                  className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                    selectedStudentId === b.student_user_id
                      ? 'bg-blue-500/20 text-cyan-300'
                      : 'bg-slate-800/60 text-slate-400 hover:text-blue-200'
                  }`}>
                  学生 {b.student_user_id.slice(-6)}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setSelectedStudentId(null)}
                className="rounded-xl px-4 py-2 text-sm text-slate-500 hover:text-blue-200"
              >
                + 绑定更多
              </button>
            </div>

            {/* 绑定面板（折叠） */}
            {!selectedStudentId && profile?.id && (
              <div className="mx-auto max-w-md">
                <ParentBindingPanel userId={profile.id} role="parent" />
              </div>
            )}

            {/* 学生数据（只读） */}
            {selectedStudentId && (
              <div className="space-y-6">
                {loading ? (
                  <div className="rounded-2xl border border-blue-500/20 bg-slate-900/60 p-8 text-center text-sm text-slate-500">
                    加载中…
                  </div>
                ) : (
                  <>
                    {/* 规划概览 */}
                    {plans.length > 0 && (
                      <div className="rounded-2xl border border-blue-500/20 bg-slate-900/60 p-5">
                        <h3 className="mb-3 text-sm font-semibold text-blue-100">当前规划</h3>
                        {plans.map((p) => (
                          <div key={p.plan_id} className="mb-2 rounded-lg bg-slate-800/40 p-3">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-sm text-slate-200">{p.plan_title}</p>
                                <p className="text-xs text-slate-500">
                                  {p.plan_start_date} ~ {p.plan_end_date || '进行中'}
                                </p>
                              </div>
                              {p.stats && (
                                <span className="rounded-full bg-blue-500/15 px-3 py-1 text-xs text-blue-200">
                                  进度 {p.stats.progressPercent}%
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* 甘特图 */}
                    {ganttData && <GanttChart ganttData={ganttData} readOnly />}

                    {/* 报表 */}
                    {weeklyReport && <WeeklyReportCard report={weeklyReport} role="parent" />}
                    {monthlyReport && <MonthlyReportCard report={monthlyReport} role="parent" />}

                    {!plans.length && !ganttData && (
                      <div className="rounded-2xl border border-blue-500/20 bg-slate-900/60 p-8 text-center text-sm text-slate-500">
                        该学生暂无规划数据
                      </div>
                    )}
                  </>
                )}

                {/* 只读提示 */}
                <p className="text-center text-[10px] text-slate-600">
                  家长端仅可查看学习数据，不可修改规划。如需调整学习计划，请联系授课老师。
                </p>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
