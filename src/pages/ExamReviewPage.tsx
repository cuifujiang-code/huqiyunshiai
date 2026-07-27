import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import DashboardHeader from '../components/layout/DashboardHeader'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { submitExamReview } from '../lib/examReviewApi'
import { copyExamReviewText } from '../components/examReview/ExamReviewPrint'
import type {
  ExamReviewFormData,
  ExamReviewReport,
  LossReason,
  SubjectScoreInput,
} from '../types/examReview'

const CORE_SUBJECTS = ['语文', '数学', '英语']
const DEFAULT_ELECTIVES = ['物理', '化学', '生物']
const LOSS_REASONS: LossReason[] = ['计算错误', '概念不清', '审题失误', '时间不够', '粗心大意']

type Step = 'form' | 'loading' | 'report'

function emptyScore(): SubjectScoreInput {
  return { score: 0, avg: 0, max: 100 }
}

function buildInitialScores(subjects: string[]): Record<string, SubjectScoreInput> {
  const scores: Record<string, SubjectScoreInput> = {}
  subjects.forEach((s) => {
    scores[s] = emptyScore()
  })
  return scores
}

function renderMarkdownBlock(text: string) {
  if (!text) return null
  const lines = text.split('\n')
  return (
    <div className="space-y-2 text-sm leading-relaxed text-slate-200">
      {lines.map((line, i) => {
        const trimmed = line.trim()
        if (!trimmed) return <div key={i} className="h-2" />
        if (trimmed.startsWith('### ')) {
          return (
            <h4 key={i} className="mt-3 text-base font-semibold text-cyan-200">
              {trimmed.slice(4)}
            </h4>
          )
        }
        if (trimmed.startsWith('## ')) {
          return (
            <h3 key={i} className="mt-4 text-lg font-semibold text-blue-200">
              {trimmed.slice(3)}
            </h3>
          )
        }
        if (trimmed.startsWith('# ')) {
          return (
            <h2 key={i} className="mt-4 text-xl font-bold text-blue-100">
              {trimmed.slice(2)}
            </h2>
          )
        }
        if (trimmed.startsWith('- ')) {
          return (
            <p key={i} className="pl-4 text-slate-300">
              • {trimmed.slice(2).replace(/\*\*(.+?)\*\*/g, '$1')}
            </p>
          )
        }
        const html = trimmed.replace(/\*\*(.+?)\*\*/g, '<strong class="text-amber-200">$1</strong>')
        return (
          <p
            key={i}
            className="text-slate-300"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        )
      })}
    </div>
  )
}

export default function ExamReviewPage() {
  const { user, profile } = useAuth()
  const reportRef = useRef<HTMLDivElement>(null)
  const [step, setStep] = useState<Step>('form')
  const [electives, setElectives] = useState<string[]>(DEFAULT_ELECTIVES)
  const [form, setForm] = useState<ExamReviewFormData>(() => ({
    examName: '期中考试',
    examDate: new Date().toISOString().split('T')[0],
    scores: buildInitialScores([...CORE_SUBJECTS, ...DEFAULT_ELECTIVES]),
    lossReasons: [],
  }))
  const [report, setReport] = useState<ExamReviewReport | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [copyOk, setCopyOk] = useState(false)

  const allSubjects = useMemo(() => [...CORE_SUBJECTS, ...electives.slice(0, 3)], [electives])

  useEffect(() => {
    if (!user?.id) return
    supabase
      .from('profiles')
      .select('selected_subjects')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        const raw = data?.selected_subjects
        let list = DEFAULT_ELECTIVES
        if (Array.isArray(raw)) {
          list = raw.filter((s): s is string => typeof s === 'string' && s.length > 0).slice(0, 3)
        } else if (typeof raw === 'string') {
          try {
            const parsed = JSON.parse(raw)
            if (Array.isArray(parsed)) list = parsed.slice(0, 3)
          } catch {
            /* ignore */
          }
        }
        if (list.length) {
          setElectives(list)
          setForm((prev) => ({
            ...prev,
            scores: buildInitialScores([...CORE_SUBJECTS, ...list]),
          }))
        }
      })
      .catch(() => {})
  }, [user?.id])

  const updateScore = (subject: string, field: keyof SubjectScoreInput, value: number) => {
    setForm((prev) => ({
      ...prev,
      scores: {
        ...prev.scores,
        [subject]: { ...prev.scores[subject], [field]: value },
      },
    }))
  }

  const toggleLossReason = (reason: LossReason) => {
    setForm((prev) => ({
      ...prev,
      lossReasons: prev.lossReasons.includes(reason)
        ? prev.lossReasons.filter((r) => r !== reason)
        : [...prev.lossReasons, reason],
    }))
  }

  const handleSubmit = useCallback(async () => {
    if (!user?.id) {
      setMessage('请先登录')
      return
    }
    for (const s of allSubjects) {
      const row = form.scores[s]
      if (!row || row.max <= 0) {
        setMessage(`请完整填写「${s}」的分数信息`)
        return
      }
    }

    setMessage(null)
    setStep('loading')
    try {
      const res = await submitExamReview(user.id, form, electives)
      if (!res.success || !res.report) {
        setMessage(res.message || '生成报告失败')
        setStep('form')
        return
      }
      setReport(res.report)
      setStep('report')
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '提交失败')
      setStep('form')
    }
  }, [user?.id, form, allSubjects, electives])

  const handlePrint = () => {
    if (!report) return
    document.body.classList.add('exam-review-printing')
    window.print()
    window.setTimeout(() => document.body.classList.remove('exam-review-printing'), 500)
  }

  const handleCopy = async () => {
    if (!report) return
    const text = copyExamReviewText(report.diagnosis, report.actionPlan)
    try {
      await navigator.clipboard.writeText(text)
      setCopyOk(true)
      setTimeout(() => setCopyOk(false), 2000)
    } catch {
      setMessage('复制失败，请手动选择文本复制')
    }
  }

  const handleReset = () => {
    setStep('form')
    setReport(null)
    setMessage(null)
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white exam-review-page">
      <div className="no-print">
        <DashboardHeader
          title="考试复盘"
          backTo="/student/dashboard"
          backLabel="返回学习中心"
          featureNavRole="student"
        />
      </div>

      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        {step === 'form' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold text-blue-100">期中考成绩录入</h2>
              <p className="mt-1 text-sm text-slate-400">
                固定科目：语文、数学、英语；选科：
                {electives.join('、') || '（未设置，默认物化生）'}
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs text-slate-400">考试名称</span>
                <input
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
                  value={form.examName}
                  onChange={(e) => setForm((p) => ({ ...p, examName: e.target.value }))}
                />
              </label>
              <label className="block">
                <span className="text-xs text-slate-400">考试日期</span>
                <input
                  type="date"
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
                  value={form.examDate}
                  onChange={(e) => setForm((p) => ({ ...p, examDate: e.target.value }))}
                />
              </label>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-800">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-900/80 text-left text-xs text-slate-400">
                    <th className="px-4 py-3">科目</th>
                    <th className="px-4 py-3">本次分数</th>
                    <th className="px-4 py-3">班级平均分</th>
                    <th className="px-4 py-3">年级最高分</th>
                  </tr>
                </thead>
                <tbody>
                  {allSubjects.map((subject) => (
                    <tr key={subject} className="border-b border-slate-800/60">
                      <td className="px-4 py-3 font-medium text-blue-100">
                        {subject}
                        {CORE_SUBJECTS.includes(subject) ? (
                          <span className="ml-1 text-[10px] text-slate-500">必修</span>
                        ) : (
                          <span className="ml-1 text-[10px] text-cyan-600">选科</span>
                        )}
                      </td>
                      {(['score', 'avg', 'max'] as const).map((field) => (
                        <td key={field} className="px-4 py-2">
                          <input
                            type="number"
                            min={0}
                            max={150}
                            className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm"
                            value={form.scores[subject]?.[field] ?? 0}
                            onChange={(e) =>
                              updateScore(subject, field, Number(e.target.value) || 0)
                            }
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div>
              <p className="mb-2 text-xs text-slate-400">主要失分原因（可多选）</p>
              <div className="flex flex-wrap gap-2">
                {LOSS_REASONS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => toggleLossReason(r)}
                    className={`rounded-full border px-3 py-1.5 text-xs transition ${
                      form.lossReasons.includes(r)
                        ? 'border-cyan-500/50 bg-cyan-500/20 text-cyan-200'
                        : 'border-slate-700 text-slate-400 hover:border-slate-500'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            {message && <p className="text-sm text-red-400">{message}</p>}

            <button
              type="button"
              onClick={handleSubmit}
              className="w-full rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 py-3 text-sm font-semibold shadow-lg shadow-blue-600/30 hover:from-blue-500"
            >
              生成 AI 复盘报告
            </button>
          </div>
        )}

        {step === 'loading' && (
          <div className="py-20 text-center">
            <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
            <p className="text-slate-300">DeepSeek 正在分析成绩并生成复盘报告…</p>
            <p className="mt-2 text-xs text-slate-500">含历史对比与题库专项推荐，约需 10–30 秒</p>
          </div>
        )}

        {step === 'report' && report && (
          <div ref={reportRef} className="exam-review-print-area space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3 no-print">
              <div>
                <h2 className="text-xl font-semibold text-blue-100">{report.examName}</h2>
                <p className="text-sm text-slate-400">考试日期：{report.examDate}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handlePrint}
                  className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-200 hover:border-blue-400"
                >
                  打印报告
                </button>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-200 hover:border-blue-400"
                >
                  {copyOk ? '已复制' : '复制文本'}
                </button>
                <button
                  type="button"
                  onClick={handleReset}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium hover:bg-blue-500"
                >
                  新建复盘
                </button>
              </div>
            </div>

            <div className="hidden print:block mb-6 border-b border-gray-300 pb-4">
              <h1 className="text-2xl font-bold text-black">{report.examName} · 考试复盘报告</h1>
              <p className="mt-1 text-sm text-gray-600">
                考试日期：{report.examDate}
                {profile?.phone ? ` · 学生 ${profile.phone.slice(-4)}` : ''}
              </p>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-800 print:border-gray-300">
              <table className="w-full text-sm print:text-black">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-900/80 text-left text-xs text-slate-400">
                    <th className="px-4 py-2">科目</th>
                    <th className="px-4 py-2">分数</th>
                    <th className="px-4 py-2">班均</th>
                    <th className="px-4 py-2">失分率</th>
                    <th className="px-4 py-2">趋势</th>
                  </tr>
                </thead>
                <tbody>
                  {report.analysis.map((a) => {
                    const trend = report.trend?.find((t) => t.subject === a.subject)
                    return (
                      <tr
                        key={a.subject}
                        className={`border-b border-slate-800/60 ${
                          a.highPriority ? 'bg-red-950/30' : ''
                        }`}
                      >
                        <td className={`px-4 py-2 font-medium ${a.highPriority ? 'text-red-300' : 'text-blue-100'}`}>
                          {a.subject}
                          {a.highPriority && (
                            <span className="ml-2 text-[10px] text-red-400">优先突破</span>
                          )}
                        </td>
                        <td className="px-4 py-2">{a.score}</td>
                        <td className="px-4 py-2">{a.avg}</td>
                        <td className={`px-4 py-2 ${a.highPriority ? 'text-red-300 font-medium' : ''}`}>
                          {a.deviationPercent}%
                        </td>
                        <td className="px-4 py-2 text-slate-400">
                          {trend?.delta != null
                            ? `${trend.delta >= 0 ? '+' : ''}${trend.delta}`
                            : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {report.practiceTips.length > 0 && (
              <div className="rounded-xl border border-cyan-900/40 bg-cyan-950/20 p-4">
                <h3 className="text-sm font-medium text-cyan-200">推荐专项练习</h3>
                <ul className="mt-2 space-y-1 text-sm text-slate-300">
                  {report.practiceTips.map((p, i) => (
                    <li key={i}>
                      {p.subject} · {p.knowledgePoint}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
              <h3 className="mb-3 text-lg font-semibold text-blue-200">诊断分析</h3>
              {renderMarkdownBlock(report.diagnosis)}
            </section>

            <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
              <h3 className="mb-3 text-lg font-semibold text-blue-200">后半程学习计划</h3>
              {renderMarkdownBlock(report.actionPlan)}
            </section>
          </div>
        )}
      </main>
    </div>
  )
}
