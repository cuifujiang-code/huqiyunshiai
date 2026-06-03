import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import DashboardHeader from '../components/layout/DashboardHeader'
import { useMembership } from '../context/MembershipContext'
import { saveExamToBank } from '../lib/examBank'
import { exportExamToPdf, exportExamToWord } from '../lib/exportPdf'
import { fetchGenerateExam } from '../lib/generateExam'
import type { Difficulty, ExamPaper, Grade, Subject } from '../types/exam'
import { DIFFICULTIES, GRADES, SUBJECTS } from '../types/exam'
import ExamPaper from '../components/exam/ExamPaper'

export default function TeacherExamPage() {
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
  const [isWarning, setIsWarning] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const handleGenerate = async () => {
    const permission = checkExam()
    if (!permission.allowed) {
      setMessage(`${permission.reason ?? '无法出题'}${permission.remaining === 0 ? '，请前往会员中心升级或续费。' : ''}`)
      setIsError(true)
      return
    }

    setLoading(true)
    setMessage(null)
    setIsError(false)
    setIsWarning(false)
    setSaved(false)

    try {
      const data = await fetchGenerateExam({ prompt, subject, grade, difficulty })
      setExam(data.exam!)
      deductExamCredit()
      const left = permission.remaining != null ? permission.remaining - 1 : null
      setIsWarning(!!data.isMockFallback)
      setMessage(
        left != null
          ? `${data.message ?? '试卷生成成功'}（本月剩余 ${left} 次出题额度）`
          : (data.message ?? '试卷生成成功'),
      )
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
    try { await exportExamToPdf(el as HTMLElement, `${exam.title}.pdf`) }
    finally { setExporting(false) }
  }

  const handleExportWord = async () => {
    const el = paperRef.current ?? document.getElementById('exam-paper-content')
    if (!el || !exam) return
    setExporting(true)
    try { await exportExamToWord(el as HTMLElement, `${exam.title}.docx`) }
    finally { setExporting(false) }
  }

  const handleSave = async () => {
    if (!exam) return
    setSaving(true)
    try { saveExamToBank(exam); setSaved(true); setMessage('试卷已保存到本地题库') }
    finally { setSaving(false) }
  }

  const selectCls =
    'rounded-[8px] border border-white/10 bg-[#1C2332] text-[#E8ECF3] px-3 py-2 text-sm outline-none cursor-pointer transition focus:border-[#2584FF] appearance-none bg-no-repeat bg-[right_10px_center] pr-8'

  return (
    <div className="min-h-screen text-[#E8ECF3]" style={{ backgroundColor: '#121722' }}>
      <DashboardHeader title="AI智能出题" backTo="/teacher/dashboard" backLabel="返回工作台" featureNavRole="teacher" />

      {/* 会员提示 */}
      {message && isError && message.includes('会员') && (
        <div className="mx-auto mt-4 max-w-[1400px] px-5">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-[12px] border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            <span>{message}</span>
            <button type="button" onClick={() => navigate('/member-center')} className="btn-gold text-xs px-3 py-1.5">前往会员中心</button>
          </div>
        </div>
      )}

      <main className="mx-auto flex max-w-[1400px] gap-6 px-5 py-6" style={{ height: 'calc(100vh - 120px)' }}>
        {/* ========== 左侧配置区 (60%) ========== */}
        <section
          className="flex flex-col w-[60%] rounded-[12px] border border-white/[0.06] p-6"
          style={{ backgroundColor: '#1C2332' }}
        >
          <h2 className="text-lg font-bold mb-1">🤖 AI智能出题</h2>
          <p className="text-sm text-[#8A94A9] mb-5">描述出题需求，AI 为您生成完整试卷</p>

          {/* 学科/年级/难度 — 横向一行 */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div>
              <label className="block text-xs text-[#8A94A9] mb-1.5">学科</label>
              <select value={subject} onChange={(e) => setSubject(e.target.value as Subject)} className={`${selectCls} w-full`}>
                {SUBJECTS.map((s) => (<option key={s} value={s}>{s}</option>))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[#8A94A9] mb-1.5">年级</label>
              <select value={grade} onChange={(e) => setGrade(e.target.value as Grade)} className={`${selectCls} w-full`}>
                {GRADES.map((g) => (<option key={g} value={g}>{g}</option>))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[#8A94A9] mb-1.5">难度</label>
              <select value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty)} className={`${selectCls} w-full`}>
                {DIFFICULTIES.map((d) => (<option key={d} value={d}>{d}</option>))}
              </select>
            </div>
          </div>

          {/* 需求描述 — 140px */}
          <div className="flex-1 flex flex-col mb-4">
            <label className="block text-xs text-[#8A94A9] mb-1.5">出题需求描述</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="请描述您的出题需求，例如：学科、年级、题型分布、难度要求、知识点范围……"
              className="flex-1 rounded-[8px] border border-white/10 bg-[#121722] text-[#E8ECF3] placeholder-[#8A94A9] px-4 py-3 text-sm outline-none resize-none transition focus:border-[#2584FF]"
              style={{ minHeight: '140px' }}
            />
          </div>

          {/* 通栏生成按钮 */}
          <button
            type="button"
            onClick={handleGenerate}
            disabled={loading || !prompt.trim()}
            className="btn-brand w-full py-3.5 text-base"
          >
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                正在生成中...
              </span>
            ) : '一键生成试卷'}
          </button>
        </section>

        {/* ========== 右侧预览区 (40%) ========== */}
        <section
          className="flex flex-col w-[40%] rounded-[12px] border border-white/[0.06] p-6 relative overflow-hidden"
          style={{ backgroundColor: '#1C2332' }}
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold">试卷预览</h2>
            {exam?.source === 'mock' && (
              <span className="rounded-full bg-amber-500/20 px-2.5 py-0.5 text-[11px] text-amber-300">演示数据</span>
            )}
            {exam?.source === 'ai' && (
              <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-[11px] text-emerald-300">AI 生成</span>
            )}
          </div>

          {/* 消息提示 */}
          {message && (
            <p className={`mb-3 rounded-[8px] border px-3 py-2 text-xs ${
              isError ? 'border-red-500/30 bg-red-500/10 text-red-300' :
              isWarning ? 'border-amber-500/40 bg-amber-500/15 text-amber-200' :
              'border-blue-500/30 bg-blue-500/10 text-blue-200'
            }`}>
              {message}
            </p>
          )}

          {/* 内容区域 */}
          <div className="flex-1 overflow-auto">
            {loading ? (
              <div className="flex h-full flex-col items-center justify-center gap-3">
                <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-[#2584FF]/30 border-t-[#2584FF]" />
                <p className="text-sm text-[#8A94A9] animate-pulse">AI 正在为您生成试卷…</p>
              </div>
            ) : exam ? (
              <ExamPaper
                exam={exam}
                paperRef={paperRef}
                onExportPdf={handleExportPdf}
                onSave={handleSave}
                exporting={exporting}
                saving={saving}
                saved={saved}
              />
            ) : (
              /* 空白引导状态 */
              <div className="flex h-full flex-col items-center justify-center text-center px-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#2584FF]/10 mb-5">
                  <svg className="h-8 w-8 text-[#2584FF]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                  </svg>
                </div>
                <p className="text-[#8A94A9] text-sm mb-4">填写出题需求，点击生成即可预览试卷</p>
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={loading || !prompt.trim()}
                  className="btn-brand text-sm px-6 py-2.5"
                >
                  立即出题
                </button>
              </div>
            )}
          </div>

          {/* 悬浮导出按钮（生成后显示） */}
          {exam && !loading && (
            <div className="absolute bottom-4 right-4 flex gap-2">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || saved}
                className="btn-secondary text-xs px-3 py-2"
              >
                {saved ? '✓ 已保存' : saving ? '保存中…' : '保存到题库'}
              </button>
              <button
                type="button"
                onClick={handleExportPdf}
                disabled={exporting}
                className="btn-brand text-xs px-3 py-2"
              >
                {exporting ? '导出中…' : '排版导出PDF'}
              </button>
              <button
                type="button"
                onClick={handleExportWord}
                disabled={exporting}
                className="btn-secondary text-xs px-3 py-2"
              >
                导出Word
              </button>
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
