import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import ExamInputPanel from '../components/exam/ExamInputPanel'
import ExamPreviewPanel from '../components/exam/ExamPreviewPanel'
import DashboardHeader from '../components/layout/DashboardHeader'
import { useMembership } from '../context/MembershipContext'
import { saveExamToBank } from '../lib/examBank'
import { exportExamToPdf } from '../lib/exportPdf'
import { fetchGenerateExam } from '../lib/generateExam'
import type { Difficulty, ExamPaper, Grade, Subject } from '../types/exam'

export default function TeacherDashboard() {
  const navigate = useNavigate()
  const { checkExam, deductExamCredit } = useMembership()
  const paperRef = useRef<HTMLDivElement>(null)

  const [prompt, setPrompt] = useState(
    '八年级物理压强单元测试卷，选择题4道、填空题2道、计算题2道，整体难度中等偏上。',
  )
  const [subject, setSubject] = useState<Subject>('物理')
  const [grade, setGrade] = useState<Grade>('八年级')
  const [difficulty, setDifficulty] = useState<Difficulty>('中等')

  const [exam, setExam] = useState<ExamPaper | null>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [isError, setIsError] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const handleGenerate = async () => {
    const permission = checkExam()
    if (!permission.allowed) {
      setMessage(
        `${permission.reason ?? '无法出题'}${permission.remaining === 0 ? '，请前往会员中心升级或续费。' : ''}`,
      )
      setIsError(true)
      return
    }

    setLoading(true)
    setMessage(null)
    setIsError(false)
    setSaved(false)

    try {
      const data = await fetchGenerateExam({ prompt, subject, grade, difficulty })
      setExam(data.exam!)
      deductExamCredit()
      const left = permission.remaining != null ? permission.remaining - 1 : null
      setMessage(
        left != null
          ? `${data.message ?? '试卷生成成功'}（本月剩余 ${left} 次出题额度）`
          : (data.message ?? '试卷生成成功'),
      )
      setIsError(false)
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '试卷生成失败，请稍后重试')
      setIsError(true)
    } finally {
      setLoading(false)
    }
  }

  const handleExportPdf = async () => {
    const el = paperRef.current ?? document.getElementById('exam-paper-content')
    if (!el || !exam) return

    setExporting(true)
    try {
      await exportExamToPdf(el as HTMLElement, `${exam.title}.pdf`)
    } catch {
      setMessage('PDF 导出失败，请重试')
    } finally {
      setExporting(false)
    }
  }

  const handleSave = async () => {
    if (!exam) return
    setSaving(true)
    try {
      saveExamToBank(exam)
      setSaved(true)
      setMessage('试卷已保存到我的题库')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <DashboardHeader title="AI智能出题 · 教师工作台" />

      <main className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 sm:py-8">
        {message && isError && message.includes('会员') && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            <span>{message}</span>
            <button
              type="button"
              onClick={() => navigate('/member-center')}
              className="rounded-lg bg-amber-500/20 px-3 py-1 text-xs font-medium text-amber-200 hover:bg-amber-500/30"
            >
              前往会员中心
            </button>
          </div>
        )}
        <div className="flex flex-col gap-6 lg:flex-row lg:items-stretch">
          <div className="w-full lg:w-[40%] lg:shrink-0">
            <ExamInputPanel
              prompt={prompt}
              subject={subject}
              grade={grade}
              difficulty={difficulty}
              loading={loading}
              onPromptChange={setPrompt}
              onSubjectChange={setSubject}
              onGradeChange={setGrade}
              onDifficultyChange={setDifficulty}
              onGenerate={handleGenerate}
            />
          </div>
          <div className="w-full lg:w-[60%] lg:min-h-[calc(100vh-140px)]">
            <ExamPreviewPanel
              exam={exam}
              loading={loading}
              message={message}
              isError={isError}
              paperRef={paperRef}
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
