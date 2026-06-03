import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import DashboardHeader from '../components/layout/DashboardHeader'
import MathRenderer from '../components/common/MathRenderer'
import { useAuth } from '../context/AuthContext'
import { useQuestionBasket } from '../context/QuestionBasketContext'
import QuestionBasket from '../components/batch/QuestionBasket'
import { exportHtmlAsWord, questionsToHtml } from '../lib/exportDoc'
import { exportToPdf } from '../lib/exportPdf'
import { buildExam } from '../lib/teacherApi'
import { builtExamToLayoutData, saveLayoutExamData } from '../types/examLayout'
import type { BuiltExam, ExamTypeRow } from '../types/teacher'
import { SUBJECT_QUESTION_TYPES, TEACHER_GRADES, TEACHER_SUBJECTS, btnPrimary, btnSecondary, inputClass } from '../types/teacher'

const defaultRow = (): ExamTypeRow => ({
  question_type: '选择题',
  count: 5,
  scorePerQuestion: 3,
  difficultyMix: [2, 2, 1],
})

export default function TeacherExamBuilderPage() {
  const { profile } = useAuth()
  const teacherId = profile?.id ?? ''
  const navigate = useNavigate()
  const previewRef = useRef<HTMLDivElement>(null)

  const [title, setTitle] = useState('单元测试卷')
  const [subject, setSubject] = useState('物理')
  const [grade, setGrade] = useState('八年级')
  const [rows, setRows] = useState<ExamTypeRow[]>([defaultRow()])
  const [knowledgeCoverage, setKnowledgeCoverage] = useState('')
  const [exam, setExam] = useState<BuiltExam | null>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [expandedQuestions, setExpandedQuestions] = useState<Set<string>>(new Set())
  const { count: basketCount } = useQuestionBasket()

  // 根据学科获取题型列表
  const questionTypes = SUBJECT_QUESTION_TYPES[subject] || ['选择题', '填空题', '解答题']

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

  const toggleExpand = (qid: string) => {
    setExpandedQuestions((prev) => {
      const next = new Set(prev)
      if (next.has(qid)) next.delete(qid)
      else next.add(qid)
      return next
    })
  }

  // 修改题型时自动同步第一个题型的下拉选项
  const updateRowType = (i: number, newType: string) => {
    const n = [...rows]
    n[i].question_type = newType
    setRows(n)
  }

  return (
    <div className="min-h-screen text-[#E8ECF3]" style={{ backgroundColor: '#121722' }}>
      <DashboardHeader title="智能组卷" backTo="/teacher/dashboard" backLabel="返回工作台" featureNavRole="teacher" />
      <main className="mx-auto flex max-w-6xl gap-6 px-5 py-6" style={{ height: 'calc(100vh - 100px)' }}>
        {message && <p className="mb-4 text-sm text-blue-300">{message}</p>}
        <div className="flex gap-6 w-full h-full">
          {/* ===== 左侧：组卷配置 (60%) ===== */}
          <section className="flex flex-col w-[60%] rounded-[12px] border border-white/[0.06] p-5" style={{ backgroundColor: '#1C2332' }}>
            <h3 className="text-sm font-semibold mb-4">📄 组卷配置</h3>
            {basketCount > 0 && (
              <p className="mb-4 rounded-[8px] border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-300">
                试题篮中有 <strong>{basketCount}</strong> 道题目，可直接用于组卷
              </p>
            )}
            {/* 标题 + 学科年级 — 横向一行 */}
            <div className="flex gap-3 mb-3">
              <input className="input-brand flex-1" placeholder="试卷名称" value={title} onChange={(e) => setTitle(e.target.value)} />
              <select className="select-brand w-[110px]" value={subject} onChange={(e) => { setSubject(e.target.value); const types = SUBJECT_QUESTION_TYPES[e.target.value] || ['选择题']; setRows([{ ...defaultRow(), question_type: types[0] }]) }}>
                {TEACHER_SUBJECTS.map((s) => <option key={s}>{s}</option>)}
              </select>
              <select className="select-brand w-[100px]" value={grade} onChange={(e) => setGrade(e.target.value)}>
                {TEACHER_GRADES.map((g) => <option key={g}>{g}</option>)}
              </select>
            </div>
            {/* 知识点 */}
            <input className="input-brand mb-4" placeholder="知识点覆盖（选填，逗号分隔）" value={knowledgeCoverage} onChange={(e) => setKnowledgeCoverage(e.target.value)} />

            {/* 题型配置 — 紧凑 */}
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-[#8A94A9]">题型分布</p>
              <p className="text-xs text-[#2584FF] font-semibold">总分 {totalScore}</p>
            </div>
            <div className="flex-1 overflow-y-auto mb-4 space-y-2">
              {rows.map((row, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <select className="select-brand flex-1" value={row.question_type} onChange={(e) => updateRowType(i, e.target.value)}>
                    {questionTypes.map((t) => <option key={t}>{t}</option>)}
                  </select>
                  <input type="number" className="input-brand w-[70px]" placeholder="题数" min={1} value={row.count} onChange={(e) => { const n = [...rows]; n[i].count = Math.max(1, +e.target.value || 1); setRows(n) }} />
                  <input type="number" className="input-brand w-[70px]" placeholder="分值" min={1} value={row.scorePerQuestion} onChange={(e) => { const n = [...rows]; n[i].scorePerQuestion = Math.max(1, +e.target.value || 1); setRows(n) }} />
                  <button type="button" className="text-[#8A94A9] hover:text-red-400 text-lg shrink-0" onClick={() => setRows(rows.filter((_, j) => j !== i))}>×</button>
                </div>
              ))}
              <button type="button" className="btn-secondary text-xs w-full" onClick={() => setRows([...rows, defaultRow()])}>+ 添加题型</button>
            </div>
            {/* 通栏蓝色生成按钮 */}
            <button type="button" className="btn-brand w-full py-3 text-base" disabled={loading} onClick={handleBuild}>
              {loading ? '组卷中…' : '智能生成试卷'}
            </button>
          </section>

          {/* ===== 右侧：试卷预览 (40%) ===== */}
          <section className="flex flex-col w-[40%] rounded-[12px] border border-white/[0.06] bg-white text-black p-5 relative overflow-hidden">
            {!exam ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <p className="text-slate-400 text-sm mb-4">配置参数生成试卷</p>
                <button type="button" className="btn-brand text-sm px-5 py-2.5" onClick={handleBuild} disabled={loading}>
                  前往选题
                </button>
              </div>
            ) : (
              <>
                <div ref={previewRef} id="exam-builder-preview" className="flex-1 overflow-auto">
                  <h1 className="text-center text-xl font-bold">{exam.title}</h1>
                  <p className="mt-2 text-center text-sm text-slate-500">
                    {exam.grade}{exam.subject} · 满分 {exam.totalScore}分
                  </p>
                  {exam.sections.map((sec) => (
                    <div key={sec.question_type} className="mt-6">
                      <h2 className="mb-2 border-b border-slate-200 pb-1 font-semibold text-slate-700">
                        {sec.question_type}（{sec.questions.length}题，共{sec.questions.reduce((s, q) => s + (q.score || 0), 0)}分）
                      </h2>
                      {sec.questions.map((q) => {
                        const qid = `${sec.question_type}_${q.number}`
                        const expanded = expandedQuestions.has(qid)
                        return (
                          <div key={qid} className="mt-3 border-b border-gray-100 pb-3">
                            <div className="flex cursor-pointer items-start gap-2" onClick={() => toggleExpand(qid)}>
                              <span className="mt-0.5 shrink-0 select-none text-xs text-slate-400">{expanded ? '▼' : '▶'}</span>
                              <div className="min-w-0 flex-1">
                                <p className="text-sm leading-relaxed">
                                  <strong>{q.number}.</strong>（{q.score}分）
                                  <MathRenderer text={q.content} className="text-sm" />
                                </p>
                              </div>
                            </div>
                            {expanded && (
                              <div className="ml-6 mt-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs space-y-2">
                                {q.options && q.options.length > 0 && (
                                  <div>
                                    <span className="font-semibold text-slate-500">选项：</span>
                                    <div className="mt-1 grid grid-cols-2 gap-1">
                                      {q.options.map((opt, oi) => (<span key={oi} className="text-slate-700"><MathRenderer text={opt} /></span>))}
                                    </div>
                                  </div>
                                )}
                                <div><span className="font-semibold text-green-600">答案：</span><MathRenderer text={q.answer} /></div>
                                {q.analysis && q.analysis !== '暂无' && (
                                  <div><span className="font-semibold text-blue-600">解析：</span><MathRenderer text={q.analysis} /></div>
                                )}
                                <div className="flex gap-3 text-slate-400">
                                  <span>知识点：{q.knowledge_point || '未分类'}</span>
                                  <span>难度：{q.difficulty}</span>
                                  <span>来源：{q.source}</span>
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  ))}
                </div>
                {/* 悬浮"一键排版"按钮 */}
                <div className="absolute bottom-4 right-4 flex gap-2">
                  <button type="button" className="btn-brand text-xs px-3 py-2" onClick={() => { saveLayoutExamData(builtExamToLayoutData(exam)); navigate('/teacher/exam-layout', { state: { exam } }) }}>
                    一键排版
                  </button>
                  <button type="button" className="btn-secondary text-xs px-3 py-2" onClick={() => exportHtmlAsWord(questionsToHtml(exam.title, exam.sections), exam.title)}>导出Word</button>
                  <button type="button" className="btn-secondary text-xs px-3 py-2" onClick={() => previewRef.current && exportToPdf(previewRef.current, `${exam.title}.pdf`)}>导出PDF</button>
                </div>
              </>
            )}
          </section>
        </div>
      </main>
      <QuestionBasket />
    </div>
  )
}
