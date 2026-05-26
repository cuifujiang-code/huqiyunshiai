import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import DiagnosisAnalyzingStep from '../components/diagnosis/DiagnosisAnalyzingStep'
import DiagnosisCompareConfirmStep from '../components/diagnosis/DiagnosisCompareConfirmStep'
import DiagnosisInputStep from '../components/diagnosis/DiagnosisInputStep'
import DiagnosisReportView from '../components/diagnosis/DiagnosisReportView'
import DashboardHeader from '../components/layout/DashboardHeader'
import { useMembership } from '../context/MembershipContext'
import { fetchDiagnosisReport, prepareDiagnosisComparison } from '../lib/fetchDiagnosis'
import { exportToPdf } from '../lib/exportPdf'
import { revokePreviewUrls } from '../lib/answerSheetCompress'
import type { DiagnosisFormData, DiagnosisReport } from '../types/diagnosis'

type Step = 'input' | 'confirm' | 'analyzing' | 'report'

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
  const [examPaperText, setExamPaperText] = useState('')
  const [answerSheetOcrText, setAnswerSheetOcrText] = useState('')
  const [ocrIncomplete, setOcrIncomplete] = useState(false)
  const [report, setReport] = useState<DiagnosisReport | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [analyzingMessage, setAnalyzingMessage] = useState('')
  const [analyzingMode, setAnalyzingMode] = useState<'prepare' | 'diagnosis'>('prepare')
  const [exporting, setExporting] = useState(false)
  const [planTasks, setPlanTasks] = useState<Record<string, boolean>>({})
  const [notice, setNotice] = useState<string | null>(null)
  const [noticeWarning, setNoticeWarning] = useState(false)
  const [quotaError, setQuotaError] = useState<string | null>(null)

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
    setAnalyzingMode('prepare')
    setAnalyzingMessage('正在解析试卷...')

    try {
      const prepareResult = await prepareDiagnosisComparison(
        {
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

      if (!prepareResult.success) {
        const errMsg = prepareResult.message || '试卷解析或 OCR 识别失败'
        setNotice(
          prepareResult.errorDetail
            ? `${errMsg}（${JSON.stringify(prepareResult.errorDetail).slice(0, 120)}）`
            : errMsg,
        )
        setNoticeWarning(true)
        setStep('input')
        return
      }

      setExamPaperText(prepareResult.examPaperText ?? '')
      setAnswerSheetOcrText(prepareResult.answerSheetOcrText ?? '')
      setOcrIncomplete(!!prepareResult.ocrIncomplete)
      setForm((prev) => ({
        ...prev,
        examPaperText: prepareResult.examPaperText,
        answerSheetOcrText: prepareResult.answerSheetOcrText,
        ocrIncomplete: prepareResult.ocrIncomplete,
      }))
      setStep('confirm')
    } catch (err) {
      console.error('[诊断页面] prepare 失败', err)
      setNotice(err instanceof Error ? err.message : '处理失败，请重试')
      setNoticeWarning(true)
      setStep('input')
    } finally {
      setSubmitting(false)
    }
  }

  const handleConfirm = async () => {
    if (!ensureQuota()) return

    const confirmedForm: DiagnosisFormData = {
      ...form,
      examPaperText: examPaperText.trim(),
      answerSheetOcrText: answerSheetOcrText.trim(),
      ocrIncomplete,
    }
    setForm(confirmedForm)

    setSubmitting(true)
    setStep('analyzing')
    setAnalyzingMode('diagnosis')
    setAnalyzingMessage('正在AI对比分析...')
    setNotice(null)

    try {
      const data = await fetchDiagnosisReport(confirmedForm, {
        onProgress: (msg) => setAnalyzingMessage(msg),
      })

      deductDiagnosisCredit()
      setReport(data.report!)
      setNotice(data.message ?? null)
      setNoticeWarning(!!data.isMockFallback)
      setStep('report')
    } catch (err) {
      setNotice(err instanceof Error ? err.message : '诊断失败')
      setNoticeWarning(true)
      setStep('confirm')
    } finally {
      setSubmitting(false)
    }
  }

  const handleReupload = () => {
    setExamPaperText('')
    setAnswerSheetOcrText('')
    setOcrIncomplete(false)
    setForm((prev) => ({
      ...prev,
      examPaperText: undefined,
      answerSheetOcrText: undefined,
      ocrIncomplete: undefined,
    }))
    setStep('input')
  }

  const cleanup = () => {
    if (form.answerSheetImages?.length) revokePreviewUrls(form.answerSheetImages)
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <DashboardHeader title="AI学习诊断" backTo="/student/dashboard" backLabel="返回学习中心" featureNavRole="student" />

      <main className="mx-auto max-w-4xl px-4 py-6 sm:py-8">
        {quotaError && (step === 'input' || step === 'confirm') && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            <span>{quotaError}</span>
            <button type="button" onClick={() => navigate('/member-center')} className="rounded-lg bg-amber-500/20 px-3 py-1 text-xs text-amber-200 hover:bg-amber-500/30">
              前往会员中心
            </button>
          </div>
        )}
        {notice && step === 'input' && noticeWarning && (
          <p className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/15 px-3 py-2 text-sm text-amber-200">{notice}</p>
        )}
        {notice && step === 'report' && (
          <p className={`mb-4 rounded-lg border px-3 py-2 text-sm ${noticeWarning ? 'border-amber-500/40 bg-amber-500/15 text-amber-200' : 'border-blue-500/30 bg-blue-500/10 text-blue-200'}`}>
            {notice}
          </p>
        )}

        {step === 'input' && (
          <DiagnosisInputStep form={form} onChange={setForm} onProceed={handleProceed} loading={submitting} />
        )}
        {step === 'confirm' && (
          <DiagnosisCompareConfirmStep
            form={form}
            examPaperText={examPaperText}
            answerSheetOcrText={answerSheetOcrText}
            ocrIncomplete={ocrIncomplete}
            onExamPaperTextChange={setExamPaperText}
            onAnswerSheetOcrTextChange={setAnswerSheetOcrText}
            onConfirm={handleConfirm}
            onReupload={handleReupload}
            loading={submitting}
          />
        )}
        {step === 'analyzing' && (
          <DiagnosisAnalyzingStep message={analyzingMessage} hasImage mode={analyzingMode === 'prepare' ? 'prepare' : 'diagnosis'} />
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
            onBackHome={() => { cleanup(); navigate('/student/dashboard') }}
            exporting={exporting}
            planTasks={planTasks}
            onToggleTask={(id) => setPlanTasks((p) => ({ ...p, [id]: !p[id] }))}
          />
        )}
      </main>
    </div>
  )
}
