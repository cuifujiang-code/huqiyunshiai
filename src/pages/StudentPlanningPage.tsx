import { useMemo, useRef, useState, useCallback, type ReactNode } from 'react'
import DashboardHeader from '../components/layout/DashboardHeader'
import PlanningInputPanel from '../components/planning/PlanningInputPanel'
import PlanningPreviewPanel from '../components/planning/PlanningPreviewPanel'
import PlanningReportView from '../components/planning/PlanningReportView'
import { useAuth } from '../context/AuthContext'
import { exportToPdf } from '../lib/exportPdf'
import { fetchPlanningReport } from '../lib/fetchPlanning'
import { getStudentPlanningRecords, savePlanningRecord } from '../lib/planningStorage'
import type { PlanningFormData, PlanningReport, SavedPlanningRecord, GanttTask, PlanningTaskProgress } from '../types/planning'

const API_BASE = 'https://api.huqiyunshiai.online'

type Tab = 'create' | 'records'

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

  // 甘特图 & 进度跟踪
  const [checklistProgress, setChecklistProgress] = useState<Record<string, boolean>>({})
  const [supabaseProgress, setSupabaseProgress] = useState<PlanningTaskProgress[]>([])

  /** 从教育规划报告中构建甘特图任务 */
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
    } catch { /* 静默失败 */ }
  }, [profile?.id])

  /** 勾选/取消勾选任务进度，同步到 Supabase */
  const handleChecklistToggle = useCallback(async (phaseIndex: number, taskIndex: number) => {
    const activeReport = selectedRecord?.report ?? report
    const planId = selectedRecord?.id ?? report?.title ?? ''
    const key = `${phaseIndex}_${taskIndex}`
    const newCompleted = !checklistProgress[key]

    // 先更新本地状态（乐观更新）
    setChecklistProgress((p) => ({ ...p, [key]: newCompleted }))

    if (!planId || !profile?.id) return

    try {
      const taskName = activeReport?.phaseTasks?.[phaseIndex]?.tasks?.[taskIndex] || ''
      await fetch(`${API_BASE}/api/student/planning-progress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId, userId: profile.id, phaseIndex, taskIndex, taskName, completed: newCompleted,
        }),
      })
    } catch {
      // 回滚
      setChecklistProgress((p) => ({ ...p, [key]: !newCompleted }))
    }
  }, [checklistProgress, selectedRecord, report, profile?.id])

  /** 甘特图勾选回调 */
  const handleGanttToggle = useCallback(async (taskId: string) => {
    // 从 taskId 解析 phaseIndex 和 taskIndex
    const match = taskId.match(/_(\d+)_(\d+)$/)
    if (match) {
      handleChecklistToggle(parseInt(match[1]), parseInt(match[2]))
    }
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
      console.log('[教育规划页面-学生] 提交表单，即将请求 API', {
        url: '/api/planning/generate',
        payload,
      })
      const data = await fetchPlanningReport(payload)
      console.log('[教育规划页面-学生] API 完整响应', data)
      setReport(data.report!)
      setIsWarning(!!data.isMockFallback)
      setMessage(data.message ?? '教育规划方案生成成功')
      savePlanningRecord({
        form: payload,
        report: data.report!,
        createdBy: 'student',
        creatorUserId: profile?.id,
        studentUserId: profile?.id,
      })
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '规划方案生成失败，请稍后重试')
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
    try {
      await exportToPdf(el as HTMLElement, `${activeReport.title}.pdf`)
    } catch {
      setMessage('PDF 导出失败，请重试')
      setIsWarning(true)
    } finally {
      setExporting(false)
    }
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
            {records.length > 0 && (
              <span className="ml-1 rounded-full bg-blue-500/30 px-1.5 text-xs">{records.length}</span>
            )}
          </TabButton>
        </div>

        {tab === 'create' && (
          <div className="flex flex-col gap-6 lg:flex-row lg:items-stretch">
            <div className="w-full lg:w-[40%] lg:shrink-0">
              <PlanningInputPanel
                form={form}
                loading={loading}
                onChange={setForm}
                onGenerate={handleGenerate}
                showStudentName
              />
            </div>
            <div className="w-full lg:w-[60%]">
              <PlanningPreviewPanel
                report={report}
                loading={loading}
                message={message}
                isWarning={isWarning}
                reportRef={reportRef}
                onExportPdf={handleExportPdf}
                exporting={exporting}
                ganttTasks={ganttTasks}
                checklistProgress={checklistProgress}
                onChecklistToggle={handleChecklistToggle}
                onGanttToggle={handleGanttToggle}
              />
            </div>
          </div>
        )}

        {tab === 'records' && (
          <div className="flex flex-col gap-6 lg:flex-row">
            <div className="w-full space-y-3 lg:w-[35%]">
              <h2 className="text-sm font-medium text-slate-400">包含您自行创建及教师为您生成的方案</h2>
              {records.length === 0 ? (
                <div className="rounded-2xl border border-blue-500/20 bg-slate-900/60 p-8 text-center text-sm text-slate-500">
                  暂无规划记录，请先新建规划或请教师为您生成
                </div>
              ) : (
                records.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => viewRecord(r)}
                    className={`w-full rounded-xl border p-4 text-left transition ${
                      selectedRecord?.id === r.id
                        ? 'border-cyan-400/50 bg-cyan-500/10'
                        : 'border-slate-700/50 bg-slate-900/60 hover:border-blue-500/30'
                    }`}
                  >
                    <p className="font-medium text-blue-100">{r.report.title}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {r.createdBy === 'teacher' ? '教师生成' : '自行创建'} ·{' '}
                      {new Date(r.createdAt).toLocaleDateString('zh-CN')}
                    </p>
                  </button>
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
                        {selectedRecord.createdBy === 'teacher' ? '教师为您生成' : '您自行创建'} ·{' '}
                        {new Date(selectedRecord.createdAt).toLocaleString('zh-CN')}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleExportPdf}
                      disabled={exporting}
                      className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-xs text-cyan-200"
                    >
                      {exporting ? '导出中…' : '导出 PDF'}
                    </button>
                  </div>
                  <div className="max-h-[calc(100vh-220px)] overflow-y-auto">
                    <PlanningReportView
                      report={selectedRecord.report}
                      reportRef={reportRef}
                      ganttTasks={ganttTasks}
                      checklistProgress={checklistProgress}
                      onChecklistToggle={handleChecklistToggle}
                      supabaseProgress={supabaseProgress}
                      onGanttToggle={handleGanttToggle}
                    />
                  </div>
                </div>
              ) : (
                <div className="flex min-h-[320px] items-center justify-center rounded-2xl border border-blue-500/20 bg-slate-900/60 p-8 text-center text-slate-500">
                  请从左侧选择一条规划记录查看
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
        active
          ? 'bg-blue-500/20 text-cyan-300'
          : 'bg-slate-800/60 text-slate-400 hover:text-blue-200'
      }`}
    >
      {children}
    </button>
  )
}
