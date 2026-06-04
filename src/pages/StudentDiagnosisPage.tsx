import { useRef, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import DiagnosisAnalyzingStep from '../components/diagnosis/DiagnosisAnalyzingStep'
import DiagnosisInputStep from '../components/diagnosis/DiagnosisInputStep'
import DiagnosisReportView from '../components/diagnosis/DiagnosisReportView'
import DashboardHeader from '../components/layout/DashboardHeader'
import { useAuth } from '../context/AuthContext'
import { useMembership } from '../context/MembershipContext'
import { runSequentialDiagnosis } from '../lib/fetchDiagnosis'
import { exportToPdf } from '../lib/exportPdf'
import { revokePreviewUrls } from '../lib/answerSheetCompress'
import type { DiagnosisFormData, DiagnosisReport, DiagnosisHistoryItem, ClassComparison } from '../types/diagnosis'
import { getTeacherApiBase } from '../lib/apiBase'

type Step = 'input' | 'analyzing' | 'report'

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
  const { user } = useAuth()
  const { checkDiagnosis, deductDiagnosisCredit } = useMembership()
  const reportRef = useRef<HTMLDivElement>(null)

  const [step, setStep] = useState<Step>('input')
  const [form, setForm] = useState<DiagnosisFormData>(defaultForm)
  const [report, setReport] = useState<DiagnosisReport | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [analyzingMessage, setAnalyzingMessage] = useState('')
  const [exporting, setExporting] = useState(false)
  const [planTasks, setPlanTasks] = useState<Record<string, boolean>>({})
  const [notice, setNotice] = useState<string | null>(null)
  const [noticeWarning, setNoticeWarning] = useState(false)
  const [quotaError, setQuotaError] = useState<string | null>(null)

  // 进步趋势 & 班级对比
  const [diagnosisHistory, setDiagnosisHistory] = useState<DiagnosisHistoryItem[]>([])
  const [classComparison, setClassComparison] = useState<ClassComparison | undefined>()

  // 报告展示后加载历史数据和班级对比
  useEffect(() => {
    if (step === 'report' && user?.id && form.subject) {
      const controller = new AbortController()
      fetch(`${getTeacherApiBase()}/api/student/diagnosis-history?userId=${user.id}&subject=${form.subject}&limit=10`, {
        signal: controller.signal,
      }).then((r) => r.json()).then((d) => {
        if (d.success && d.history?.length >= 2) setDiagnosisHistory(d.history)
      }).catch(() => {})

      fetch(`${getTeacherApiBase()}/api/student/class-comparison?userId=${user.id}&subject=${form.subject}`, {
        signal: controller.signal,
      }).then((r) => r.json()).then((d) => {
        if (d.success && d.comparison) setClassComparison(d.comparison)
      }).catch(() => {})
      return () => controller.abort()
    }
  }, [step, user?.id, form.subject])

  const ensureQuota = () => {
    const permission = checkDiagnosis()
    if (!permission.allowed) {
      setQuotaError(permission.reason ?? '诊断次数不足，请前往会员中心购买')
      return false
    }
    setQuotaError(null)
    return true
  }

  const handleProceed = async () => {
    if (!ensureQuota()) return

    const examFile = form.examFile
    const images = form.answerSheetImages ?? []
    if (!examFile?.base64 || images.length === 0) {
      setNotice('请上传标准试卷和至少一张答题卡')
      setNoticeWarning(true)
      return
    }

    setSubmitting(true)
    setNotice(null)
    setNoticeWarning(false)
    setStep('analyzing')
    setAnalyzingMessage('正在提交诊断任务...')

    try {
      const data = await runSequentialDiagnosis(
        {
          userId: user?.id,
          examType: form.examType,
          subject: form.subject,
          score: form.score,
          fullScore: form.fullScore,
          gradeRank: form.gradeRank,
          confusion: form.confusion,
          examFileBase64: examFile.base64,
          examFileName: examFile.name,
          answerImages: images.map((img) => ({
            name: img.name,
            base64: img.base64,
            mimeType: img.mimeType,
          })),
        },
        { onProgress: (msg) => setAnalyzingMessage(msg) },
      )

      if (!data.success || !data.report) {
        setNotice(data.message || '诊断失败，请重试')
        setNoticeWarning(true)
        setStep('input')
        return
      }

      deductDiagnosisCredit()
      setReport(data.report)
      setNotice(data.message ?? null)
      setNoticeWarning(!!data.isMockFallback)
      setStep('report')
    } catch (err) {
      console.error('[诊断页面] 异步诊断失败', err)
      setNotice(err instanceof Error ? err.message : '处理失败，请重试')
      setNoticeWarning(true)
      setStep('input')
    } finally {
      setSubmitting(false)
    }
  }

  const handleRetry = () => {
    setNotice(null)
    setNoticeWarning(false)
    setStep('input')
  }

  const cleanup = () => {
    if (form.answerSheetImages?.length) revokePreviewUrls(form.answerSheetImages)
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
              className="rounded-lg bg-amber-500/20 px-3 py-1 text-xs text-amber-200 hover:bg-amber-500/30"
            >
              前往会员中心
            </button>
          </div>
        )}
        {notice && (step === 'input' || step === 'report') && (
          <div
            className={`mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm ${
              noticeWarning
                ? 'border-amber-500/40 bg-amber-500/15 text-amber-200'
                : 'border-blue-500/30 bg-blue-500/10 text-blue-200'
            }`}
          >
            <span>{notice}</span>
            {noticeWarning && step === 'input' && (
              <button
                type="button"
                onClick={handleRetry}
                className="shrink-0 rounded-lg bg-amber-500/20 px-3 py-1 text-xs text-amber-200 hover:bg-amber-500/30"
              >
                重新提交
              </button>
            )}
          </div>
        )}

        {step === 'input' && (
          <DiagnosisInputStep form={form} onChange={setForm} onProceed={handleProceed} loading={submitting} />
        )}
        {step === 'analyzing' && (
          <DiagnosisAnalyzingStep
            message={analyzingMessage}
            hasImage
            mode="async"
          />
        )}
        {step === 'report' && report && (
          <DiagnosisReportView
            report={report}
            reportRef={reportRef}
            onExportPdf={async () => {
              const el = reportRef.current
              if (!el) return
              setExporting(true)
              try {
                await exportToPdf(el, `${report.title}.pdf`)
              } catch {
                setNotice('PDF 导出失败')
              } finally {
                setExporting(false)
              }
            }}
            onShare={() => alert('诊断报告链接已复制（演示）')}
            onBackHome={() => {
              cleanup()
              navigate('/student/dashboard')
            }}
            exporting={exporting}
            planTasks={planTasks}
            onToggleTask={(id) => setPlanTasks((p) => ({ ...p, [id]: !p[id] }))}
            diagnosisHistory={diagnosisHistory.length > 0 ? diagnosisHistory : undefined}
            classComparison={classComparison}
          />
        )}
      </main>
    </div>
  )
}
