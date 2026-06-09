import { useRef, useState } from 'react'
import DashboardHeader from '../components/layout/DashboardHeader'
import HandoutEditorPanel from '../components/handout/HandoutEditorPanel'
import HandoutOcrImportModal from '../components/handout/HandoutOcrImportModal'
import { createCustomHandout, createModule } from '../components/handout/handoutConstants'
import { useAuth } from '../context/AuthContext'
import { incrementFeatureUsage } from '../lib/featureUsage'
import { exportHtmlAsWord } from '../lib/exportDoc'
import { handoutPreviewHtml, handoutToExportHtml, handoutBookmarkOutline } from '../lib/handoutExport'
import { parseWorkbuddyJson, pdfFileToPageImages } from '../lib/handoutImportUtils'
import { exportToPdf } from '../lib/exportPdf'
import {
  fetchHandouts,
  generateHandoutDraft,
  generateKnowledgeSummary,
  handwritingToHandout,
  saveHandout,
} from '../lib/teacherApi'
import type { ExportMode, HandoutContent, HandoutMode } from '../types/teacher'
import { btnPrimary, btnSecondary, inputClass } from '../types/teacher'

const MODES: { mode: HandoutMode; emoji: string; title: string; desc: string }[] = [
  { mode: 'school', emoji: '🏫', title: '校内45分钟大班课', desc: '知识梳理 + 典型例题 + 课堂练习 + 课后作业' },
  { mode: 'tutoring', emoji: '📚', title: '校外2小时小班课', desc: '知识点循环讲解 + 综合练习 + 本讲总结' },
  { mode: 'targeted', emoji: '🎯', title: '针对性辅导讲义', desc: '基于学生诊断薄弱点，分知识点训练' },
  { mode: 'custom', emoji: '🧩', title: '自定义模板', desc: '自由拖拽模块，OCR 导入，自定义排版' },
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
    exportMode: draft.exportMode ?? 'print',
    modules: draft.modules.map((m) => ({
      ...m,
      style: m.style ?? { fontSize: 14, color: '#111827', fontFamily: 'Microsoft YaHei' },
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
  const [handoutId, setHandoutId] = useState<string | null>(null)
  const [history, setHistory] = useState<{ id: string; title: string; mode: string }[]>([])
  const [loading, setLoading] = useState(false)
  const [ocrLoading, setOcrLoading] = useState(false)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [ocrModalOpen, setOcrModalOpen] = useState(false)
  const [knowledgePoint, setKnowledgePoint] = useState('')
  const [exportMode, setExportMode] = useState<ExportMode>('print')
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
    setExportMode(draft.exportMode ?? 'print')
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
      const saved = await saveHandout(teacherId, {
        id: handoutId ?? undefined,
        title: content.title,
        mode,
        content: { ...content, exportMode },
      })
      setHandoutId(saved.id ?? null)
      incrementFeatureUsage(teacherId, 'handout')
      setMessage('讲义已保存')
      loadHistory()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '保存失败')
    }
  }

  const handleImportJson = (json: Record<string, unknown>) => {
    const draft = parseWorkbuddyJson(json, { title, subject, teacherName: profile?.phone })
    enterEdit('custom', draft)
    setOcrModalOpen(false)
    setMessage('已从 WorkBuddy JSON 导入')
  }

  const handleImportPdf = async (file: File) => {
    if (!teacherId) {
      setMessage('请先登录')
      return
    }
    setOcrLoading(true)
    setMessage(null)
    try {
      const pageImages = await pdfFileToPageImages(file)
      const result = await handwritingToHandout({
        teacherId,
        pageImages,
        title: title || file.name.replace(/\.pdf$/i, ''),
        subject,
        grade,
        mode: 'custom',
        saveToDb: true,
        teacherName: profile?.phone,
      })
      enterEdit('custom', result.content)
      setHandoutId(result.handout?.id ?? null)
      setOcrModalOpen(false)
      setMessage('手写 PDF 已识别并保存为讲义')
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'OCR 导入失败')
    } finally {
      setOcrLoading(false)
    }
  }

  const handleGenerateSummary = async (kp: string) => {
    setSummaryLoading(true)
    setMessage(null)
    try {
      const exerciseModules = content?.modules.filter((m) => m.type === 'example' || m.type === 'exercise') ?? []
      const summary = await generateKnowledgeSummary({
        subject,
        grade,
        knowledgePoint: kp || knowledgePoint || title,
        questions: exerciseModules.map((m) => ({ content: m.content })),
      })
      const mod = createModule('summary', kp ? `${kp} · 知识点总结` : '知识点总结')
      mod.content = summary
      setContent((prev) => (prev ? { ...prev, modules: [...prev.modules, mod] } : prev))
      setMessage('知识点总结已添加')
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '生成失败')
    } finally {
      setSummaryLoading(false)
    }
  }

  const handleExportWord = () => {
    if (!content) return
    exportHtmlAsWord(handoutToExportHtml({ ...content, exportMode }, { mode: exportMode }), content.title, {
      mode: exportMode,
      title: content.title,
    })
  }

  const handleExportPdf = async () => {
    if (!previewRef.current || !content) return
    await exportToPdf(previewRef.current, `${content.title}.pdf`, {
      mode: exportMode,
      bookmarks: handoutBookmarkOutline({ ...content, exportMode }),
    })
  }

  if (step === 'pick') {
    return (
      <div className="min-h-screen text-[#E8ECF3]" style={{ backgroundColor: '#121722' }}>
        <DashboardHeader title="讲义制作" backTo="/teacher/dashboard" backLabel="返回工作台" featureNavRole="teacher" />
        <main className="mx-auto max-w-5xl px-5 py-8">
          {message && <p className="mb-4 text-sm text-red-300">{message}</p>}
          <div className="mb-4 flex gap-3">
            <input className="input-brand flex-1" placeholder="讲义标题" value={title} onChange={(e) => setTitle(e.target.value)} />
            <input className="input-brand w-[140px]" placeholder="学科" value={subject} onChange={(e) => setSubject(e.target.value)} />
            <input className="input-brand w-[120px]" placeholder="年级" value={grade} onChange={(e) => setGrade(e.target.value)} />
          </div>
          <textarea className="input-brand mb-6" rows={2} placeholder="教学目标（选填，AI 模式使用）" value={objectives} onChange={(e) => setObjectives(e.target.value)} />
          <div className="grid gap-4 grid-cols-2">
            {MODES.map((m) => (
              <button
                key={m.mode}
                type="button"
                disabled={loading}
                onClick={() => void handlePickMode(m.mode)}
                className={`card-lift p-5 text-left cursor-pointer ${m.mode === 'custom' ? '!border-[#2584FF]/40' : ''}`}
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
      <HandoutOcrImportModal
        open={ocrModalOpen}
        onClose={() => setOcrModalOpen(false)}
        onImportJson={handleImportJson}
        onImportPdf={handleImportPdf}
        loading={ocrLoading}
      />
      <main className="mx-auto grid max-w-7xl gap-4 px-5 py-6 lg:grid-cols-2">
        <section className="max-h-[calc(100vh-8rem)] overflow-y-auto pr-1">
          {message && <p className="mb-3 text-sm text-blue-300">{message}</p>}
          <div className="mb-3 flex gap-2 text-xs">
            <span className="text-[#8A94A9] self-center">导出模式</span>
            <button
              type="button"
              className={`rounded px-3 py-1 ${exportMode === 'print' ? 'bg-[#2584FF] text-white' : 'bg-slate-700 text-slate-300'}`}
              onClick={() => setExportMode('print')}
            >
              可打印版
            </button>
            <button
              type="button"
              className={`rounded px-3 py-1 ${exportMode === 'digital' ? 'bg-[#2584FF] text-white' : 'bg-slate-700 text-slate-300'}`}
              onClick={() => setExportMode('digital')}
            >
              电子阅读版
            </button>
          </div>
          {content && (
            <HandoutEditorPanel
              content={{ ...content, exportMode }}
              onChange={setContent}
              onImportOcr={() => setOcrModalOpen(true)}
              onGenerateSummary={handleGenerateSummary}
              summaryLoading={summaryLoading}
              knowledgePoint={knowledgePoint}
              onKnowledgePointChange={setKnowledgePoint}
            />
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className="btn-brand flex-1 min-w-[100px]" onClick={() => void handleSave()}>保存讲义</button>
            <button type="button" className="btn-secondary flex-1 min-w-[100px]" onClick={handleExportWord}>导出 Word</button>
            <button type="button" className="btn-secondary flex-1 min-w-[100px]" onClick={() => void handleExportPdf()}>导出 PDF</button>
          </div>
          <p className="mt-2 text-xs text-[#8A94A9]">PDF 含章节书签 · Word 保留字体颜色 · 缺答案自动标注</p>
        </section>
        <section className="sticky top-4 max-h-[calc(100vh-6rem)] overflow-y-auto">
          <p className="mb-2 text-xs text-[#8A94A9]">导出预览（{exportMode === 'print' ? '可打印版' : '电子阅读版'}）</p>
          <div
            ref={previewRef}
            className="rounded-[12px] border border-white/[0.06] bg-white p-2 text-black shadow-xl"
            dangerouslySetInnerHTML={{ __html: content ? handoutPreviewHtml({ ...content, exportMode }) : '' }}
          />
        </section>
      </main>
    </div>
  )
}
