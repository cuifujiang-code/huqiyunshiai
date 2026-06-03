import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import DashboardHeader from '../components/layout/DashboardHeader'
import { useAuth } from '../context/AuthContext'
import { fetchQuestions, generateQuestion, saveLessonPlan } from '../lib/teacherApi'
import type { BankQuestion } from '../types/teacher'

const selectCls = 'select-brand w-full'

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
        subject: '物理', grade: '八年级', question_type: '应用题',
        difficulty: '中等', knowledge_point: keyword || '综合',
      })
      setSelected([...selected, { ...q, source: 'AI生成' }])
      setMessage('AI 已生成新题并加入备课列表')
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'AI 生成失败')
    } finally { setAiLoading(false) }
  }

  const handleSave = async () => {
    if (!teacherId || !title.trim()) return
    setSaving(true)
    try {
      await saveLessonPlan(teacherId, {
        title, objectives,
        question_ids: selected.map((q) => q.id!).filter(Boolean),
      })
      setMessage('备课方案已保存')
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '保存失败')
    } finally { setSaving(false) }
  }

  return (
    <div className="min-h-screen text-[#E8ECF3]" style={{ backgroundColor: '#121722' }}>
      <DashboardHeader title="智能备课" backTo="/teacher/dashboard" backLabel="返回工作台" featureNavRole="teacher" />
      <main className="mx-auto flex max-w-6xl gap-5 px-5 py-6" style={{ height: 'calc(100vh - 100px)' }}>
        {/* ===== 左栏：题库选题 ===== */}
        <aside className="w-[340px] flex flex-col rounded-[12px] border border-white/[0.06] p-4" style={{ backgroundColor: '#1C2332' }}>
          <h3 className="text-sm font-semibold mb-3">题库选题</h3>
          <input
            className="input-brand mb-3"
            placeholder="搜索题目关键词…"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
          <div className="flex-1 overflow-y-auto space-y-2">
            {bank.map((q) => (
              <button
                key={q.id}
                type="button"
                onClick={() => addQuestion(q)}
                className="w-full rounded-[8px] border border-white/[0.06] p-3 text-left text-xs transition hover:border-[#2584FF]/40 cursor-pointer"
              >
                <span className="text-[#8A94A9]">{q.question_type} · {q.difficulty} · {q.subject}</span>
                <p className="mt-1 line-clamp-2 text-[#E8ECF3]">{q.content}</p>
              </button>
            ))}
          </div>
        </aside>

        {/* ===== 右栏：备课编辑区 ===== */}
        <section className="flex-1 flex flex-col rounded-[12px] border border-white/[0.06] p-5" style={{ backgroundColor: '#1C2332' }}>
          {message && <p className="mb-3 rounded-[8px] border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-sm text-blue-200">{message}</p>}

          {/* 备课名称 + 教学目标 — 紧凑上下 */}
          <input
            className="input-brand mb-2"
            placeholder="备课名称"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <textarea
            className="input-brand mb-4"
            rows={3}
            placeholder="教学目标"
            value={objectives}
            onChange={(e) => setObjectives(e.target.value)}
          />

          {/* 已选题目列表 */}
          <h3 className="text-sm font-semibold mb-2">已选题目（{selected.length}）</h3>
          <div className="flex-1 overflow-y-auto mb-4 space-y-2">
            {selected.map((q, i) => (
              <div key={`${q.id}-${i}`} className="flex items-start justify-between gap-2 rounded-[8px] border border-white/[0.06] p-3 text-sm">
                <div className="min-w-0">
                  <span className="text-xs text-[#2584FF]">{q.source}</span>
                  <p className="mt-0.5 line-clamp-2 text-[#E8ECF3]">{q.content}</p>
                </div>
                <button
                  type="button"
                  className="text-[#8A94A9] hover:text-red-400 shrink-0 text-lg leading-none"
                  onClick={() => setSelected(selected.filter((_, j) => j !== i))}
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          {/* 底部三按钮 */}
          <div className="flex gap-3">
            <button type="button" className="btn-secondary flex-1" disabled={aiLoading} onClick={handleAiGenerate}>
              {aiLoading ? '生成中…' : 'AI 补充题目'}
            </button>
            <button type="button" className="btn-brand flex-1" disabled={saving} onClick={handleSave}>
              {saving ? '保存中…' : '保存备课'}
            </button>
            <button type="button" className="btn-secondary flex-1" onClick={() => navigate('/teacher/handout-builder')}>
              导出讲义
            </button>
          </div>
        </section>
      </main>
    </div>
  )
}
