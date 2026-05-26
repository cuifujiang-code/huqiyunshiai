import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import DiagnosisAnalyzingStep from '../components/diagnosis/DiagnosisAnalyzingStep'
import DiagnosisInputStep from '../components/diagnosis/DiagnosisInputStep'
import DiagnosisOcrConfirmStep from '../components/diagnosis/DiagnosisOcrConfirmStep'
import DiagnosisReportView from '../components/diagnosis/DiagnosisReportView'
import DashboardHeader from '../components/layout/DashboardHeader'
import { useMembership } from '../context/MembershipContext'
import { fetchDiagnosisReport } from '../lib/fetchDiagnosis'
import { recognizeExamImages } from '../lib/examOcr'
import { exportToPdf } from '../lib/exportPdf'
import { revokeExamImageUrls } from '../lib/imageCompress'
import type { DiagnosisFormData, DiagnosisReport } from '../types/diagnosis'

type Step = 'input' | 'ocr' | 'analyzing' | 'report'

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

  const [step, setStep] = useState<Step>('input')
  const [form, setForm] = useState<DiagnosisFormData>(defaultForm)
  const [ocrText, setOcrText] = useState('')
  const [ocrIncomplete, setOcrIncomplete] = useState(false)
  const [report, setReport] = useState<DiagnosisReport | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [analyzingMessage, setAnalyzingMessage] = useState('AI正在分析你的学习数据...')
  const [exporting, setExporting] = useState(false)
  const [planTasks, setPlanTasks] = useState<Record<string, boolean>>({})
  const [notice, setNotice] = useState<string | null>(null)
  const [noticeWarning, setNoticeWarning] = useState(false)
  const [quotaError, setQuotaError] = useState<string | null>(null)

  const hasImages = (form.examImages?.length ?? 0) > 0

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

    if (hasImages) {
      setSubmitting(true)
      setStep('analyzing')
      setAnalyzingMessage('正在加载 OCR 引擎...')

      try {
        const result = await recognizeExamImages(
          (form.examImages ?? []).map((img) => ({ previewUrl: img.previewUrl, name: img.name })),
          (msg) => setAnalyzingMessage(msg),
        )
        setOcrText(result.combinedText)
        setOcrIncomplete(result.incomplete)
        setForm((prev) => ({
          ...prev,
          ocrText: result.combinedText,
          ocrIncomplete: result.incomplete,
        }))
        setStep('ocr')
      } catch (err) {
        console.error('[诊断页面] OCR 失败', err)
        setNotice(err instanceof Error ? err.message : '试卷文字识别失败，请重试')
        setNoticeWarning(true)
        setStep('input')
      } finally {
        setSubmitting(false)
      }
      return
    }

    await runDiagnosis({ ...form, ocrText: undefined, ocrIncomplete: undefined })
  }

  const handleOcrConfirm = async () => {
    if (!ensureQuota()) return
    const confirmedForm = {
      ...form,
      ocrText: ocrText.trim(),
      ocrIncomplete,
    }
    setForm(confirmedForm)
    await runDiagnosis(confirmedForm)
  }

  const handleReupload = () => {
    setOcrText('')
    setOcrIncomplete(false)
    setForm((prev) => ({ ...prev, ocrText: undefined, ocrIncomplete: undefined }))
    setStep('input')
  }

  const runDiagnosis = async (diagnosisForm: DiagnosisFormData) => {
    setSubmitting(true)
    setNotice(null)
    setNoticeWarning(false)
    setAnalyzingMessage(
      diagnosisForm.ocrText ? '正在基于 OCR 文本生成诊断报告...' : 'AI正在分析你的学习数据...',
    )
    setStep('analyzing')

    console.log('[诊断页面] 提交诊断', {
      url: '/api/diagnosis/generate',
      imageCount: diagnosisForm.examImages?.length ?? 0,
      ocrLength: diagnosisForm.ocrText?.length ?? 0,
      ocrIncomplete: diagnosisForm.ocrIncomplete,
    })

    try {
      const data = await fetchDiagnosisReport(diagnosisForm, {
        onProgress: (msg) => setAnalyzingMessage(msg),
      })
      console.log('[诊断页面] API 完整响应', data)

      deductDiagnosisCredit()
      setReport(data.report!)
      setNotice(data.message ?? null)
      setNoticeWarning(!!data.isMockFallback)
      setStep('report')
    } catch (err) {
      console.error('[诊断页面] 失败', err)
      setNotice(err instanceof Error ? err.message : '诊断报告生成失败，请稍后重试')
      setNoticeWarning(true)
      setStep(diagnosisForm.ocrText ? 'ocr' : 'input')
    } finally {
      setSubmitting(false)
    }
  }

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
        {quotaError && (step === 'input' || step === 'ocr') && (
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
        {notice && step === 'input' && noticeWarning && (
          <p className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/15 px-3 py-2 text-sm text-amber-200">
            {notice}
          </p>
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
          <DiagnosisInputStep form={form} onChange={setForm} onProceed={handleProceed} loading={submitting} />
        )}
        {step === 'ocr' && (
          <DiagnosisOcrConfirmStep
            form={form}
            ocrText={ocrText}
            ocrIncomplete={ocrIncomplete}
            onOcrTextChange={setOcrText}
            onConfirm={handleOcrConfirm}
            onReupload={handleReupload}
            loading={submitting}
          />
        )}
        {step === 'analyzing' && (
          <DiagnosisAnalyzingStep
            message={analyzingMessage}
            hasImage={hasImages}
            mode={hasImages && !form.ocrText ? 'ocr' : 'diagnosis'}
          />
        )}
        {step === 'report' && report && (
          <DiagnosisReportView
            report={report}
            reportRef={reportRef}
            onExportPdf={handleExportPdf}
            onShare={handleShare}
            onBackHome={() => {
              if (form.examImages?.length) revokeExamImageUrls(form.examImages)
              navigate('/student/dashboard')
            }}
            exporting={exporting}
            planTasks={planTasks}
            onToggleTask={handleToggleTask}
          />
        )}
      </main>
    </div>
  )
}
