import { useRef, useState } from 'react'
import DashboardHeader from '../components/layout/DashboardHeader'
import { useAuth } from '../context/AuthContext'
import { exportHtmlAsWord, handoutToHtml } from '../lib/exportDoc'
import { exportToPdf } from '../lib/exportPdf'
import { fetchHandouts, generateHandoutDraft, saveHandout } from '../lib/teacherApi'
import type { HandoutContent, HandoutMode } from '../types/teacher'
import { btnPrimary, btnSecondary, inputClass } from '../types/teacher'

const MODES: { mode: HandoutMode; emoji: string; title: string; desc: string }[] = [
  { mode: 'school', emoji: '🏫', title: '校内45分钟大班课', desc: '知识梳理 + 典型例题 + 课堂练习 + 课后作业' },
  { mode: 'tutoring', emoji: '📚', title: '校外2小时小班课', desc: '知识点循环讲解 + 综合练习 + 本讲总结' },
  { mode: 'targeted', emoji: '🎯', title: '针对性辅导讲义', desc: '基于学生诊断薄弱点，分知识点训练' },
]

export default function TeacherHandoutBuilderPage() {
  const { profile } = useAuth()
  const teacherId = profile?.id ?? ''
  const previewRef = useRef<HTMLDivElement>(null)

  const [step, setStep] = useState<'pick' | 'edit'>('pick')
  const [mode, setMode] = useState<HandoutMode>('school')
  const [title, setTitle] = useState('')
  const [subject, setSubject] = useState('物理')
  const [grade, setGrade] = useState('八年级')
  const [objectives, setObjectives] = useState('')
  const [content, setContent] = useState<HandoutContent | null>(null)
  const [history, setHistory] = useState<{ id: string; title: string; mode: string }[]>([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const loadHistory = async () => {
    if (!teacherId) return
    try {
      const list = await fetchHandouts(teacherId)
      setHistory(list.map((h) => ({ id: h.id!, title: h.title, mode: h.mode })))
    } catch { /* ignore */ }
  }

  const handleGenerate = async (m: HandoutMode) => {
    setMode(m)
    setStep('edit')
    setLoading(true)
    try {
      const draft = await generateHandoutDraft(m, { title: title || '新讲义', subject, grade, objectives })
      setContent(draft)
      setTitle(draft.title)
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '生成失败')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!teacherId || !content) return
    try {
      await saveHandout(teacherId, { title: content.title, mode, content })
      setMessage('讲义已保存')
      loadHistory()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '保存失败')
    }
  }

  if (step === 'pick') {
    return (
      <div className="min-h-screen bg-slate-950 text-white">
        <DashboardHeader title="讲义制作" backTo="/teacher/dashboard" backLabel="返回工作台" featureNavRole="teacher" />
        <main className="mx-auto max-w-4xl px-4 py-8">
          <div className="mb-6 grid gap-2 sm:grid-cols-3">
            <input className={inputClass} placeholder="讲义标题" value={title} onChange={(e) => setTitle(e.target.value)} />
            <input className={inputClass} placeholder="学科" value={subject} onChange={(e) => setSubject(e.target.value)} />
            <input className={inputClass} placeholder="年级" value={grade} onChange={(e) => setGrade(e.target.value)} />
          </div>
          <textarea className={`${inputClass} mb-6`} rows={2} placeholder="教学目标（选填）" value={objectives} onChange={(e) => setObjectives(e.target.value)} />
          <div className="grid gap-4 sm:grid-cols-3">
            {MODES.map((m) => (
              <button key={m.mode} type="button" disabled={loading} onClick={() => handleGenerate(m.mode)} className="rounded-2xl border border-slate-700 bg-slate-900/60 p-5 text-left hover:border-blue-500/50">
                <span className="text-3xl">{m.emoji}</span>
                <h3 className="mt-2 font-semibold">{m.title}</h3>
                <p className="mt-1 text-xs text-slate-400">{m.desc}</p>
              </button>
            ))}
          </div>
          <button type="button" className={`${btnSecondary} mt-6`} onClick={loadHistory}>加载历史讲义</button>
          {history.length > 0 && (
            <ul className="mt-4 space-y-1 text-sm text-slate-400">
              {history.map((h) => <li key={h.id}>{h.title} ({h.mode})</li>)}
            </ul>
          )}
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <DashboardHeader title="讲义编辑" backTo="/teacher/handout-builder" backLabel="重选模式" featureNavRole="teacher" />
      <main className="mx-auto grid max-w-6xl gap-4 px-4 py-6 lg:grid-cols-2">
        <section className="space-y-3">
          {message && <p className="text-sm text-blue-300">{message}</p>}
          {content?.modules.map((mod, i) => (
            <div key={mod.id || i} className="rounded-xl border border-slate-700 p-3">
              <input className={`${inputClass} mb-2 font-semibold`} value={mod.title} onChange={(e) => {
                const modules = [...content.modules]
                modules[i] = { ...mod, title: e.target.value }
                setContent({ ...content, modules })
              }} />
              <textarea className={inputClass} rows={4} value={mod.content} onChange={(e) => {
                const modules = [...content.modules]
                modules[i] = { ...mod, content: e.target.value }
                setContent({ ...content, modules })
              }} />
            </div>
          ))}
          <div className="flex gap-2">
            <button type="button" className={btnPrimary} onClick={handleSave}>保存讲义</button>
            <button type="button" className={btnSecondary} onClick={() => content && exportHtmlAsWord(handoutToHtml(content), content.title)}>导出 Word</button>
            <button type="button" className={btnSecondary} onClick={() => previewRef.current && content && exportToPdf(previewRef.current, `${content.title}.pdf`)}>导出 PDF</button>
          </div>
        </section>
        <section ref={previewRef} className="rounded-2xl border border-slate-700 bg-white p-6 text-black">
          {content && (
            <>
              <h1 className="text-center text-xl font-bold">{content.title}</h1>
              {content.modules.map((m) => (
                <div key={m.id} className="mt-4">
                  <h2 className="font-semibold">{m.title}</h2>
                  <div className="mt-1 whitespace-pre-wrap text-sm">{m.content}</div>
                </div>
              ))}
            </>
          )}
        </section>
      </main>
    </div>
  )
}
