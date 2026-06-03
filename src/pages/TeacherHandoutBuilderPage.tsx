import { useRef, useState } from 'react'
import DashboardHeader from '../components/layout/DashboardHeader'
import HandoutEditorPanel from '../components/handout/HandoutEditorPanel'
import { createCustomHandout } from '../components/handout/handoutConstants'
import { useAuth } from '../context/AuthContext'
import { incrementFeatureUsage } from '../lib/featureUsage'
import { exportHtmlAsWord } from '../lib/exportDoc'
import { handoutPreviewHtml, handoutToExportHtml } from '../lib/handoutExport'
import { exportToPdf } from '../lib/exportPdf'
import { fetchHandouts, generateHandoutDraft, saveHandout } from '../lib/teacherApi'
import type { HandoutContent, HandoutMode } from '../types/teacher'
import { btnPrimary, btnSecondary, inputClass } from '../types/teacher'

const MODES: { mode: HandoutMode; emoji: string; title: string; desc: string }[] = [
  { mode: 'school', emoji: '🏫', title: '校内45分钟大班课', desc: '知识梳理 + 典型例题 + 课堂练习 + 课后作业' },
  { mode: 'tutoring', emoji: '📚', title: '校外2小时小班课', desc: '知识点循环讲解 + 综合练习 + 本讲总结' },
  { mode: 'targeted', emoji: '🎯', title: '针对性辅导讲义', desc: '基于学生诊断薄弱点，分知识点训练' },
  { mode: 'custom', emoji: '🧩', title: '自定义模板', desc: '自由拖拽模块，自定义封面、字号与颜色' },
]

function enrichDraft(draft: HandoutContent, teacherName?: string): HandoutContent {
  const date = new Date().toLocaleDateString('zh-CN')
  return {
    ...draft,
    cover: draft.cover ?? {
      title: draft.title,
      subtitle: '',
      teacherName: teacherName ?? '',
      date,
    },
    headerText: draft.headerText ?? draft.title,
    footerText: draft.footerText ?? '华祺云师 AI · 讲义',
    modules: draft.modules.map((m) => ({
      ...m,
      style: m.style ?? { fontSize: 14, color: '#111827' },
    })),
  }
}

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
    } catch {
      /* ignore */
    }
  }

  const enterEdit = (m: HandoutMode, draft: HandoutContent) => {
    setMode(m)
    setContent(enrichDraft(draft, profile?.phone))
    setTitle(draft.title)
    setStep('edit')
  }

  const handlePickMode = async (m: HandoutMode) => {
    setMode(m)
    if (m === 'custom') {
      enterEdit(m, createCustomHandout(title || '自定义讲义', profile?.phone))
      return
    }
    setLoading(true)
    setMessage(null)
    try {
      const draft = await generateHandoutDraft(m, {
        title: title || '新讲义',
        subject,
        grade,
        objectives,
      })
      enterEdit(m, draft)
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
      incrementFeatureUsage(teacherId, 'handout')
      setMessage('讲义已保存')
      loadHistory()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '保存失败')
    }
  }

  const handleExportPdf = async () => {
    if (!previewRef.current || !content) return
    await exportToPdf(previewRef.current, `${content.title}.pdf`)
  }

  if (step === 'pick') {
    return (
      <div className="min-h-screen text-[#E8ECF3]" style={{ backgroundColor: '#121722' }}>
        <DashboardHeader title="讲义制作" backTo="/teacher/dashboard" backLabel="返回工作台" featureNavRole="teacher" />
        <main className="mx-auto max-w-5xl px-5 py-8">
          {message && <p className="mb-4 text-sm text-red-300">{message}</p>}
          {/* 讲义名称 + 学科 + 年级 — 横向一行 */}
          <div className="mb-4 flex gap-3">
            <input className="input-brand flex-1" placeholder="讲义标题" value={title} onChange={(e) => setTitle(e.target.value)} />
            <input className="input-brand w-[140px]" placeholder="学科" value={subject} onChange={(e) => setSubject(e.target.value)} />
            <input className="input-brand w-[120px]" placeholder="年级" value={grade} onChange={(e) => setGrade(e.target.value)} />
          </div>
          <textarea className="input-brand mb-6" rows={2} placeholder="教学目标（选填，AI 模式使用）" value={objectives} onChange={(e) => setObjectives(e.target.value)} />
          {/* 模板 — 2×2 卡片 */}
          <div className="grid gap-4 grid-cols-2">
            {MODES.map((m) => (
              <button
                key={m.mode}
                type="button"
                disabled={loading}
                onClick={() => void handlePickMode(m.mode)}
                className={`card-lift p-5 text-left cursor-pointer ${
                  m.mode === 'custom' ? '!border-[#2584FF]/40' : ''
                }`}
              >
                <span className="text-3xl">{m.emoji}</span>
                <h3 className="mt-2 font-semibold">{m.title}</h3>
                <p className="mt-1 text-xs text-[#8A94A9]">{m.desc}</p>
              </button>
            ))}
          </div>
          <button type="button" className="btn-secondary mt-6" onClick={() => void loadHistory()}>加载历史讲义</button>
          {history.length > 0 && (
            <ul className="mt-4 space-y-1 text-sm text-[#8A94A9]">
              {history.map((h) => (<li key={h.id}>{h.title} ({h.mode})</li>))}
            </ul>
          )}
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen text-[#E8ECF3]" style={{ backgroundColor: '#121722' }}>
      <DashboardHeader title="讲义编辑" backTo="/teacher/handout-builder" backLabel="重选模式" featureNavRole="teacher" />
      <main className="mx-auto grid max-w-7xl gap-4 px-5 py-6 lg:grid-cols-2">
        <section className="max-h-[calc(100vh-8rem)] overflow-y-auto pr-1">
          {message && <p className="mb-3 text-sm text-blue-300">{message}</p>}
          {content && <HandoutEditorPanel content={content} onChange={setContent} />}
          {/* 底部并排按钮 */}
          <div className="mt-4 flex gap-2">
            <button type="button" className="btn-brand flex-1" onClick={() => void handleSave()}>保存讲义</button>
            <button type="button" className="btn-secondary flex-1" onClick={() => content && exportHtmlAsWord(handoutToExportHtml(content), content.title)}>导出文档</button>
            <button type="button" className="btn-secondary flex-1" onClick={() => void handleExportPdf()}>导出PDF</button>
          </div>
          <p className="mt-2 text-xs text-[#8A94A9]">PDF/Word 含封面、目录、页眉页脚</p>
        </section>
        <section className="sticky top-4 max-h-[calc(100vh-6rem)] overflow-y-auto">
          <p className="mb-2 text-xs text-[#8A94A9]">导出预览（与 PDF 1:1）</p>
          <div ref={previewRef} className="rounded-[12px] border border-white/[0.06] bg-white p-2 text-black shadow-xl" dangerouslySetInnerHTML={{ __html: content ? handoutPreviewHtml(content) : '' }} />
        </section>
      </main>
    </div>
  )
}
