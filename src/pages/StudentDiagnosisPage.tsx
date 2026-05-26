import { useCallback, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import DiagnosisAnalyzingStep from '../components/diagnosis/DiagnosisAnalyzingStep'
import DiagnosisInputStep from '../components/diagnosis/DiagnosisInputStep'
import DiagnosisReportView from '../components/diagnosis/DiagnosisReportView'
import DashboardHeader from '../components/layout/DashboardHeader'
import { useMembership } from '../context/MembershipContext'
import { fetchDiagnosisReport } from '../lib/fetchDiagnosis'
import { exportToPdf } from '../lib/exportPdf'
import type { DiagnosisFormData, DiagnosisReport, DiagnosisResponse } from '../types/diagnosis'

type Step = 'input' | 'analyzing' | 'report'

const LOADING_MS = 2000

const defaultForm: DiagnosisFormData = {
  examType: '期中考试',
  subject: '物理',
  score: 72,
  fullScore: 100,
  gradeRank: 156,
  confusion: '计算题总是算错，实验探究题完全没有思路，压强公式经常混淆。',
}

export default function StudentDiagnosisPage() {
  const navigate = useNavigate()
  const { checkDiagnosis, deductDiagnosisCredit } = useMembership()
  const reportRef = useRef<HTMLDivElement>(null)
  const fetchPromiseRef = useRef<Promise<DiagnosisResponse> | null>(null)

  const [step, setStep] = useState<Step>('input')
  const [form, setForm] = useState<DiagnosisFormData>(defaultForm)
  const [report, setReport] = useState<DiagnosisReport | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [planTasks, setPlanTasks] = useState<Record<string, boolean>>({})
  const [notice, setNotice] = useState<string | null>(null)
  const [noticeWarning, setNoticeWarning] = useState(false)
  const [quotaError, setQuotaError] = useState<string | null>(null)

  const handleSubmit = () => {
    const permission = checkDiagnosis()
    if (!permission.allowed) {
      setQuotaError(permission.reason ?? '诊断次数不足，请前往会员中心购买')
      setSubmitting(false)
      return
    }

    setQuotaError(null)
    setSubmitting(true)
    setNotice(null)
    setNoticeWarning(false)
    console.log('[诊断页面] 提交表单，即将请求 API', {
      url: '/api/diagnosis/generate',
      form,
    })
    fetchPromiseRef.current = fetchDiagnosisReport(form)
    setStep('analyzing')
  }

  const handleAnalyzingComplete = useCallback(async () => {
    deductDiagnosisCredit()
    try {
      const data = await (fetchPromiseRef.current ?? fetchDiagnosisReport(form))
      console.log('[诊断页面] API 完整响应', data)
      setReport(data.report!)
      setNotice(data.message ?? null)
      setNoticeWarning(!!data.isMockFallback)
      setStep('report')
    } catch {
      setNotice('诊断报告生成失败，请稍后重试')
      setNoticeWarning(true)
      setStep('input')
    } finally {
      setSubmitting(false)
      fetchPromiseRef.current = null
    }
  }, [form, deductDiagnosisCredit])

  const handleToggleTask = (taskId: string) => {
    setPlanTasks((prev) => ({ ...prev, [taskId]: !prev[taskId] }))
  }

  const handleExportPdf = async () => {
    const el = reportRef.current
    if (!el || !report) return
    setExporting(true)
    try {
      await exportToPdf(el, `${report.title}.pdf`)
    } catch {
      setNotice('PDF 导出失败，请重试')
    } finally {
      setExporting(false)
    }
  }

  const handleShare = () => {
    alert('诊断报告链接已复制，可发送给您的老师（演示功能）')
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <DashboardHeader title="AI学习诊断" backTo="/student/dashboard" backLabel="返回学习中心" featureNavRole="student" />

      <main className="mx-auto max-w-4xl px-4 py-6 sm:py-8">
        {quotaError && step === 'input' && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            <span>{quotaError}</span>
            <button
              type="button"
              onClick={() => navigate('/member-center')}
              className="rounded-lg bg-amber-500/20 px-3 py-1 text-xs font-medium text-amber-200 hover:bg-amber-500/30"
            >
              前往会员中心
            </button>
          </div>
        )}
        {notice && step === 'report' && (
          <p
            className={`mb-4 rounded-lg border px-3 py-2 text-sm ${
              noticeWarning
                ? 'border-amber-500/40 bg-amber-500/15 text-amber-200'
                : 'border-blue-500/30 bg-blue-500/10 text-blue-200'
            }`}
          >
            {notice}
          </p>
        )}
        {step === 'input' && (
          <DiagnosisInputStep form={form} onChange={setForm} onSubmit={handleSubmit} loading={submitting} />
        )}
        {step === 'analyzing' && (
          <DiagnosisAnalyzingStep onComplete={handleAnalyzingComplete} durationMs={LOADING_MS} />
        )}
        {step === 'report' && report && (
          <DiagnosisReportView
            report={report}
            reportRef={reportRef}
            onExportPdf={handleExportPdf}
            onShare={handleShare}
            onBackHome={() => navigate('/student/dashboard')}
            exporting={exporting}
            planTasks={planTasks}
            onToggleTask={handleToggleTask}
          />
        )}
      </main>
    </div>
  )
}
