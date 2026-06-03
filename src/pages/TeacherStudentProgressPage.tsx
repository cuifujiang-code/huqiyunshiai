import { useCallback, useEffect, useRef, useState } from 'react'
import DashboardHeader from '../components/layout/DashboardHeader'
import WeeklyReportCard from '../components/planning/WeeklyReportCard'
import MonthlyReportCard from '../components/planning/MonthlyReportCard'
import { useAuth } from '../context/AuthContext'
import { exportToPdf } from '../lib/exportPdf'
import {
  fetchMonthlyReport,
  fetchTeacherOverview,
  fetchWeeklyReport,
} from '../lib/educationPlanning'
import type {
  MonthlyReport as MonthlyReportType,
  TeacherStudentItem,
  WeeklyReport as WeeklyReportType,
} from '../types/planning'

function mondayIso(d = new Date()) {
  const date = new Date(d)
  const day = date.getDay() || 7
  if (day !== 1) date.setDate(date.getDate() - (day - 1))
  return date.toISOString().split('T')[0]
}

function currentMonthIso() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default function TeacherStudentProgressPage() {
  const { profile } = useAuth()
  const reportRef = useRef<HTMLDivElement>(null)

  const [students, setStudents] = useState<TeacherStudentItem[]>([])
  const [selected, setSelected] = useState<TeacherStudentItem | null>(null)
  const [weekStart, setWeekStart] = useState(mondayIso())
  const [month, setMonth] = useState(currentMonthIso())
  const [weeklyReport, setWeeklyReport] = useState<WeeklyReportType | null>(null)
  const [monthlyReport, setMonthlyReport] = useState<MonthlyReportType | null>(null)
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadStudents = useCallback(async () => {
    if (!profile?.id) return
    const res = await fetchTeacherOverview(profile.id)
    if (res.success) setStudents(res.students || [])
  }, [profile?.id])

  useEffect(() => {
    void loadStudents()
  }, [loadStudents])

  const handleGenerateWeekly = async () => {
    if (!selected) {
      setError('请先选择学生')
      return
    }
    setLoading(true)
    setError(null)
    setMessage(null)
    const res = await fetchWeeklyReport({
      studentId: selected.studentId,
      planId: selected.planId,
      weekStart,
    })
    setLoading(false)
    if (res.success && res.report) {
      setWeeklyReport(res.report)
      setMessage('周报已生成')
    } else {
      setError(res.message || '生成周报失败')
    }
  }

  const handleGenerateMonthly = async () => {
    if (!selected) {
      setError('请先选择学生')
      return
    }
    setLoading(true)
    setError(null)
    setMessage(null)
    const res = await fetchMonthlyReport({
      studentId: selected.studentId,
      planId: selected.planId,
      month,
    })
    setLoading(false)
    if (res.success && res.report) {
      setMonthlyReport(res.report)
      setMessage('月报已生成')
    } else {
      setError(res.message || '生成月报失败')
    }
  }

  const handleExportPdf = async (type: 'weekly' | 'monthly') => {
    if (!reportRef.current) return
    setExporting(true)
    try {
      const name = selected?.studentName || '学生'
      const suffix = type === 'weekly' ? `周报-${weekStart}` : `月报-${month}`
      await exportToPdf(reportRef.current, `${name}-${suffix}.pdf`)
      setMessage('PDF 已导出')
    } catch {
      setError('PDF 导出失败')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <DashboardHeader title="学生进度与报表" featureNavRole="teacher" />

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <p className="text-sm text-slate-400">
          选择学生后生成周报或月报，支持导出 PDF。周报含任务完成与薄弱预警；月报含进步趋势与下月建议。
        </p>

        <section className="mt-6">
          <h2 className="text-sm font-medium text-slate-300">学生列表</h2>
          {students.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">暂无学生规划数据，请先在教育规划中为学生创建规划</p>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              {students.map((s) => (
                <button
                  key={s.planId}
                  type="button"
                  onClick={() => {
                    setSelected(s)
                    setWeeklyReport(null)
                    setMonthlyReport(null)
                    setMessage(null)
                    setError(null)
                  }}
                  className={`rounded-xl px-4 py-2 text-sm transition ${
                    selected?.planId === s.planId
                      ? 'bg-blue-500/25 text-cyan-200 ring-1 ring-blue-400/50'
                      : 'bg-slate-800/60 text-slate-400 hover:text-blue-200'
                  }`}
                >
                  {s.studentName}
                  <span className="ml-2 text-xs opacity-70">{s.progressPercent}%</span>
                </button>
              ))}
            </div>
          )}
        </section>

        {selected && (
          <section className="mt-8 rounded-2xl border border-blue-500/20 bg-slate-900/50 p-5">
            <h2 className="text-lg font-semibold text-blue-100">{selected.studentName}</h2>
            <p className="text-xs text-slate-500">{selected.planTitle} · 进度 {selected.progressPercent}%</p>

            <div className="mt-4 flex flex-wrap gap-4">
              <label className="text-sm text-slate-400">
                周起始（周一）
                <input
                  type="date"
                  value={weekStart}
                  onChange={(e) => setWeekStart(e.target.value)}
                  className="mt-1 block rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white"
                />
              </label>
              <label className="text-sm text-slate-400">
                月份
                <input
                  type="month"
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                  className="mt-1 block rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white"
                />
              </label>
            </div>

            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                disabled={loading}
                onClick={() => void handleGenerateWeekly()}
                className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold disabled:opacity-50"
              >
                生成周报
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => void handleGenerateMonthly()}
                className="rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold disabled:opacity-50"
              >
                生成月报
              </button>
              {weeklyReport && (
                <button
                  type="button"
                  disabled={exporting}
                  onClick={() => void handleExportPdf('weekly')}
                  className="rounded-xl border border-slate-600 px-4 py-2.5 text-sm text-slate-300"
                >
                  导出周报 PDF
                </button>
              )}
              {monthlyReport && (
                <button
                  type="button"
                  disabled={exporting}
                  onClick={() => void handleExportPdf('monthly')}
                  className="rounded-xl border border-slate-600 px-4 py-2.5 text-sm text-slate-300"
                >
                  导出月报 PDF
                </button>
              )}
            </div>

            {error && (
              <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                {error}
              </p>
            )}
            {message && (
              <p className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
                {message}
              </p>
            )}
          </section>
        )}

        <div ref={reportRef} className="mt-8 space-y-6 bg-white p-6 text-slate-900 rounded-2xl">
          {weeklyReport && (
            <div>
              <p className="mb-2 text-sm font-semibold text-slate-700">
                {selected?.studentName} · 学习周报
              </p>
              <WeeklyReportCard report={weeklyReport} role="teacher" />
            </div>
          )}
          {monthlyReport && (
            <div>
              <p className="mb-2 text-sm font-semibold text-slate-700">
                {selected?.studentName} · 学习月报
              </p>
              <MonthlyReportCard report={monthlyReport} role="teacher" />
            </div>
          )}
          {!weeklyReport && !monthlyReport && (
            <p className="text-center text-sm text-slate-500 py-8">选择学生并点击生成周报或月报</p>
          )}
        </div>
      </main>
    </div>
  )
}
