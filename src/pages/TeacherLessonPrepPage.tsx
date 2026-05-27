import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import DashboardHeader from '../components/layout/DashboardHeader'
import { useAuth } from '../context/AuthContext'
import { fetchQuestions, generateQuestion, saveLessonPlan } from '../lib/teacherApi'
import type { BankQuestion } from '../types/teacher'
import { btnPrimary, btnSecondary, inputClass } from '../types/teacher'

export default function TeacherLessonPrepPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const teacherId = profile?.id ?? ''

  const [bank, setBank] = useState<BankQuestion[]>([])
  const [keyword, setKeyword] = useState('')
  const [title, setTitle] = useState('')
  const [objectives, setObjectives] = useState('')
  const [selected, setSelected] = useState<BankQuestion[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)

  useEffect(() => {
    if (!teacherId) return
    fetchQuestions(teacherId, { pageSize: 100, keyword }).then((d) => setBank(d.items)).catch(() => {})
  }, [teacherId, keyword])

  const addQuestion = (q: BankQuestion) => {
    if (selected.some((s) => s.id === q.id && q.id)) return
    setSelected([...selected, { ...q, source: q.source || '题库' }])
  }

  const handleAiGenerate = async () => {
    setAiLoading(true)
    try {
      const q = await generateQuestion({
        subject: '物理',
        grade: '八年级',
        question_type: '应用题',
        difficulty: '中等',
        knowledge_point: keyword || '综合',
      })
      setSelected([...selected, { ...q, source: 'AI生成' }])
      setMessage('AI 已生成新题并加入备课列表')
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'AI 生成失败')
    } finally {
      setAiLoading(false)
    }
  }

  const handleSave = async () => {
    if (!teacherId || !title.trim()) return
    setSaving(true)
    try {
      await saveLessonPlan(teacherId, {
        title,
        objectives,
        question_ids: selected.map((q) => q.id!).filter(Boolean),
      })
      setMessage('备课方案已保存')
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <DashboardHeader title="智能备课" backTo="/teacher/dashboard" backLabel="返回工作台" featureNavRole="teacher" />
      <main className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6 lg:flex-row">
        <aside className="w-full rounded-2xl border border-slate-700 bg-slate-900/60 p-4 lg:w-1/3">
          <h3 className="mb-3 font-semibold text-blue-200">题库浏览</h3>
          <input className={`${inputClass} mb-3`} placeholder="搜索题目..." value={keyword} onChange={(e) => setKeyword(e.target.value)} />
          <div className="max-h-[60vh] space-y-2 overflow-y-auto">
            {bank.map((q) => (
              <button key={q.id} type="button" onClick={() => addQuestion(q)} className="w-full rounded-lg border border-slate-700 p-2 text-left text-xs hover:border-blue-500/50">
                <span className="text-slate-500">{q.question_type} · {q.difficulty}</span>
                <p className="mt-1 line-clamp-2 text-slate-200">{q.content}</p>
              </button>
            ))}
          </div>
        </aside>
        <section className="flex-1 rounded-2xl border border-slate-700 bg-slate-900/60 p-4">
          {message && <p className="mb-3 text-sm text-blue-300">{message}</p>}
          <input className={`${inputClass} mb-3`} placeholder="课题名称" value={title} onChange={(e) => setTitle(e.target.value)} />
          <textarea className={`${inputClass} mb-4`} rows={3} placeholder="教学目标" value={objectives} onChange={(e) => setObjectives(e.target.value)} />
          <h3 className="mb-2 font-semibold">已选题目（{selected.length}）</h3>
          <div className="mb-4 max-h-64 space-y-2 overflow-y-auto">
            {selected.map((q, i) => (
              <div key={`${q.id}-${i}`} className="flex items-start justify-between gap-2 rounded-lg border border-slate-700 p-2 text-sm">
                <div>
                  <span className="text-xs text-cyan-400">{q.source}</span>
                  <p className="line-clamp-2">{q.content}</p>
                </div>
                <button type="button" className="text-red-400" onClick={() => setSelected(selected.filter((_, j) => j !== i))}>×</button>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btnSecondary} disabled={aiLoading} onClick={handleAiGenerate}>{aiLoading ? '生成中...' : 'AI 生成新题'}</button>
            <button type="button" className={btnPrimary} disabled={saving} onClick={handleSave}>保存备课方案</button>
            <button type="button" className={btnSecondary} onClick={() => navigate('/teacher/handout-builder')}>导出为讲义 →</button>
          </div>
        </section>
      </main>
    </div>
  )
}
