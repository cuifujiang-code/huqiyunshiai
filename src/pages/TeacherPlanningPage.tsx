import { useRef, useState } from 'react'
import DashboardHeader from '../components/layout/DashboardHeader'
import PlanningInputPanel from '../components/planning/PlanningInputPanel'
import PlanningPreviewPanel from '../components/planning/PlanningPreviewPanel'
import { useAuth } from '../context/AuthContext'
import { exportToPdf } from '../lib/exportPdf'
import { fetchPlanningReport } from '../lib/fetchPlanning'
import { savePlanningRecord } from '../lib/planningStorage'
import type { PlanningFormData, PlanningReport } from '../types/planning'

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

  const [form, setForm] = useState<PlanningFormData>(defaultForm)
  const [report, setReport] = useState<PlanningReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [isWarning, setIsWarning] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const handleGenerate = async () => {
    if (!form.studentName.trim()) {
      setMessage('请填写学生姓名')
      setIsWarning(true)
      return
    }

    setLoading(true)
    setMessage(null)
    setIsWarning(false)
    setSaved(false)

    try {
      const payload = { ...form, createdByRole: 'teacher' as const }
      console.log('[教育规划页面-教师] 提交表单，即将请求 API', {
        url: '/api/planning/generate',
        payload,
      })
      const data = await fetchPlanningReport(payload)
      console.log('[教育规划页面-教师] API 完整响应', data)
      setReport(data.report!)
      setIsWarning(!!data.isMockFallback)
      setMessage(data.message ?? '教育规划方案生成成功')
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '规划方案生成失败，请稍后重试')
      setIsWarning(true)
    } finally {
      setLoading(false)
    }
  }

  const handleExportPdf = async () => {
    const el = reportRef.current ?? document.getElementById('planning-report-content')
    if (!el || !report) return
    setExporting(true)
    try {
      await exportToPdf(el as HTMLElement, `${report.title}.pdf`)
    } catch {
      setMessage('PDF 导出失败，请重试')
      setIsWarning(true)
    } finally {
      setExporting(false)
    }
  }

  const handleSave = () => {
    if (!report) return
    setSaving(true)
    try {
      savePlanningRecord({
        form: { ...form, createdByRole: 'teacher' },
        report,
        createdBy: 'teacher',
        creatorUserId: profile?.id,
      })
      setSaved(true)
      setMessage('规划方案已保存，学生可在学生端查看')
      setIsWarning(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <DashboardHeader title="AI教育规划 · 教师工作台" featureNavRole="teacher" />

      <main className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 sm:py-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-stretch">
          <div className="w-full lg:w-[40%] lg:shrink-0">
            <PlanningInputPanel
              form={form}
              loading={loading}
              onChange={setForm}
              onGenerate={handleGenerate}
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
              onSave={handleSave}
              exporting={exporting}
              saving={saving}
              saved={saved}
            />
          </div>
        </div>
      </main>
    </div>
  )
}
