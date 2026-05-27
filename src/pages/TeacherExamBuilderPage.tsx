import { useRef, useState } from 'react'
import DashboardHeader from '../components/layout/DashboardHeader'
import { useAuth } from '../context/AuthContext'
import { exportHtmlAsWord, questionsToHtml } from '../lib/exportDoc'
import { exportToPdf } from '../lib/exportPdf'
import { buildExam } from '../lib/teacherApi'
import type { BuiltExam, ExamTypeRow } from '../types/teacher'
import { QUESTION_TYPES, TEACHER_GRADES, TEACHER_SUBJECTS, btnPrimary, btnSecondary, inputClass } from '../types/teacher'

const defaultRow = (): ExamTypeRow => ({
  question_type: '选择题',
  count: 5,
  scorePerQuestion: 3,
  difficultyMix: [2, 2, 1],
})

export default function TeacherExamBuilderPage() {
  const { profile } = useAuth()
  const teacherId = profile?.id ?? ''
  const previewRef = useRef<HTMLDivElement>(null)

  const [title, setTitle] = useState('单元测试卷')
  const [subject, setSubject] = useState('物理')
  const [grade, setGrade] = useState('八年级')
  const [rows, setRows] = useState<ExamTypeRow[]>([defaultRow()])
  const [knowledgeCoverage, setKnowledgeCoverage] = useState('')
  const [exam, setExam] = useState<BuiltExam | null>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const totalScore = rows.reduce((s, r) => s + r.count * r.scorePerQuestion, 0)

  const handleBuild = async () => {
    if (!teacherId) return
    setLoading(true)
    setMessage(null)
    try {
      const result = await buildExam(teacherId, {
        title,
        subject,
        grade,
        knowledgeCoverage,
        typeDistribution: rows,
      })
      setExam(result)
      setMessage('组卷成功')
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '组卷失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <DashboardHeader title="智能组卷" backTo="/teacher/dashboard" backLabel="返回工作台" featureNavRole="teacher" />
      <main className="mx-auto max-w-6xl px-4 py-6">
        {message && <p className="mb-4 text-sm text-blue-300">{message}</p>}
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-2xl border border-slate-700 bg-slate-900/60 p-4">
            <h3 className="mb-3 font-semibold">组卷配置</h3>
            <input className={`${inputClass} mb-3`} placeholder="试卷名称" value={title} onChange={(e) => setTitle(e.target.value)} />
            <div className="mb-3 grid grid-cols-2 gap-2">
              <select className={inputClass} value={subject} onChange={(e) => setSubject(e.target.value)}>{TEACHER_SUBJECTS.map((s) => <option key={s}>{s}</option>)}</select>
              <select className={inputClass} value={grade} onChange={(e) => setGrade(e.target.value)}>{TEACHER_GRADES.map((g) => <option key={g}>{g}</option>)}</select>
            </div>
            <input className={`${inputClass} mb-3`} placeholder="知识点覆盖（选填）" value={knowledgeCoverage} onChange={(e) => setKnowledgeCoverage(e.target.value)} />
            <p className="mb-2 text-sm text-slate-400">题型分布 · 总分 {totalScore}</p>
            {rows.map((row, i) => (
              <div key={i} className="mb-2 grid grid-cols-4 gap-2">
                <select className={inputClass} value={row.question_type} onChange={(e) => { const n = [...rows]; n[i].question_type = e.target.value; setRows(n) }}>{QUESTION_TYPES.map((t) => <option key={t}>{t}</option>)}</select>
                <input type="number" className={inputClass} value={row.count} onChange={(e) => { const n = [...rows]; n[i].count = +e.target.value; setRows(n) }} />
                <input type="number" className={inputClass} placeholder="分值" value={row.scorePerQuestion} onChange={(e) => { const n = [...rows]; n[i].scorePerQuestion = +e.target.value; setRows(n) }} />
                <button type="button" className="text-red-400 text-sm" onClick={() => setRows(rows.filter((_, j) => j !== i))}>删</button>
              </div>
            ))}
            <button type="button" className={`${btnSecondary} mb-4`} onClick={() => setRows([...rows, defaultRow()])}>+ 添加题型</button>
            <button type="button" className={btnPrimary} disabled={loading} onClick={handleBuild}>{loading ? '组卷中...' : '智能组卷'}</button>
          </section>
          <section ref={previewRef} className="rounded-2xl border border-slate-700 bg-white p-6 text-black">
            {!exam ? (
              <p className="text-slate-500">组卷预览将显示在这里</p>
            ) : (
              <div id="exam-builder-preview">
                <h1 className="text-center text-xl font-bold">{exam.title}</h1>
                <p className="mt-2 text-center text-sm">{exam.grade}{exam.subject} · 满分 {exam.totalScore}</p>
                {exam.sections.map((sec) => (
                  <div key={sec.question_type} className="mt-6">
                    <h2 className="font-semibold">{sec.question_type}</h2>
                    {sec.questions.map((q) => (
                      <div key={q.number} className="mt-3 border-b border-gray-200 pb-2">
                        <p><strong>{q.number}.</strong>（{q.score}分）{q.content}</p>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
            {exam && (
              <div className="mt-4 flex gap-2">
                <button type="button" className={btnSecondary} onClick={() => exportHtmlAsWord(questionsToHtml(exam.title, exam.sections), exam.title)}>导出 Word</button>
                <button type="button" className={btnSecondary} onClick={() => previewRef.current && exportToPdf(previewRef.current, `${exam.title}.pdf`)}>导出 PDF</button>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  )
}
