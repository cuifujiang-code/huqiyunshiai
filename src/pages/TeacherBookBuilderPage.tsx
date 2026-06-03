import { useRef, useState } from 'react'
import DashboardHeader from '../components/layout/DashboardHeader'
import BookQuestionPicker from '../components/book/BookQuestionPicker'
import KnowledgeGraphView from '../components/book/KnowledgeGraphView'
import { useAuth } from '../context/AuthContext'
import { groupQuestionsIntoChapters } from '../lib/bookGrouping'
import { bookToExportHtml } from '../lib/bookExport'
import { exportHtmlAsWord } from '../lib/exportDoc'
import { exportToPdf } from '../lib/exportPdf'
import { incrementFeatureUsage } from '../lib/featureUsage'
import { generateBookKnowledgeGraph, saveBook } from '../lib/teacherApi'
import type { BankQuestion, BookChapter, BookCoverStyle, BookRecord, BookSection } from '../types/teacher'
import { btnPrimary, btnSecondary, inputClass } from '../types/teacher'

const COVER_OPTIONS: { id: BookCoverStyle; label: string; desc: string }[] = [
  { id: 'minimal', label: '简约', desc: '黑白经典' },
  { id: 'academic', label: '学术', desc: '深蓝专业' },
  { id: 'fresh', label: '清新', desc: '绿色活力' },
]

function newId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
}

export default function TeacherBookBuilderPage() {
  const { profile } = useAuth()
  const teacherId = profile?.id ?? ''
  const previewRef = useRef<HTMLDivElement>(null)

  const [title, setTitle] = useState('辅导书')
  const [grade, setGrade] = useState('八年级')
  const [level, setLevel] = useState('基础')
  const [coverStyle, setCoverStyle] = useState<BookCoverStyle>('academic')
  const [chapters, setChapters] = useState<BookChapter[]>([
    { id: newId('ch'), title: '第一章', sections: [{ id: newId('sec'), title: '第一节', blocks: [] }] },
  ])
  const [selectedChapter, setSelectedChapter] = useState(0)
  const [pickedQuestions, setPickedQuestions] = useState<BankQuestion[]>([])
  const [knowledgeGraph, setKnowledgeGraph] = useState<BookRecord['knowledgeGraph']>(null)
  const [graphLoading, setGraphLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const chapter = chapters[selectedChapter]

  const bookRecord = (): BookRecord => ({
    title,
    grade,
    level,
    chapters,
    coverStyle,
    knowledgeGraph,
  })

  const addChapter = () => {
    setChapters([...chapters, { id: newId('ch'), title: `第${chapters.length + 1}章`, sections: [] }])
  }

  const addSection = () => {
    const next = [...chapters]
    next[selectedChapter].sections.push({ id: newId('sec'), title: '新小节', blocks: [] })
    setChapters(next)
  }

  const addBlock = (type: 'knowledge' | 'example' | 'exercise' | 'summary') => {
    const next = [...chapters]
    const ch = next[selectedChapter]
    if (!ch.sections.length) ch.sections = [{ id: newId('sec'), title: '默认小节', blocks: [] }]
    const sec = ch.sections[0]
    const labels = { knowledge: '知识讲解', example: '例题', exercise: '练习', summary: '本章总结' }
    sec.blocks.push({
      id: newId('blk'),
      type,
      title: labels[type],
      content: '',
    })
    setChapters(next)
  }

  const applyQuestionsToChapters = () => {
    if (!pickedQuestions.length) {
      setMessage('请先从题库选择题目')
      return
    }
    const auto = groupQuestionsIntoChapters(pickedQuestions)
    setChapters(auto)
    setSelectedChapter(0)
    setMessage(`已按知识点归类 ${pickedQuestions.length} 道题，共 ${auto.length} 章`)
  }

  const handleGenerateGraph = async () => {
    if (!pickedQuestions.length) {
      setMessage('请先选择题库题目')
      return
    }
    setGraphLoading(true)
    setMessage(null)
    try {
      const graph = await generateBookKnowledgeGraph(pickedQuestions)
      setKnowledgeGraph(graph)
      setMessage('知识网络图已生成')
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '生成失败')
    } finally {
      setGraphLoading(false)
    }
  }

  const handleSave = async () => {
    if (!teacherId) return
    try {
      await saveBook(teacherId, bookRecord())
      incrementFeatureUsage(teacherId, 'book')
      setMessage('辅导书已保存')
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '保存失败')
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <DashboardHeader title="辅导书制作" backTo="/teacher/dashboard" backLabel="返回工作台" featureNavRole="teacher" />
      <main className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-6 lg:flex-row">
        <aside className="w-full shrink-0 space-y-3 lg:w-72">
          <input className={`${inputClass} text-sm py-2`} value={title} onChange={(e) => setTitle(e.target.value)} />
          <input className={`${inputClass} text-sm py-2`} value={grade} onChange={(e) => setGrade(e.target.value)} placeholder="年级" />
          <select className={`${inputClass} text-sm py-2`} value={level} onChange={(e) => setLevel(e.target.value)}>
            <option>基础</option>
            <option>提高</option>
            <option>竞赛</option>
          </select>

          <div className="rounded-xl border border-slate-700 p-3">
            <p className="mb-2 text-xs font-medium text-slate-400">封面风格</p>
            <div className="space-y-1">
              {COVER_OPTIONS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCoverStyle(c.id)}
                  className={`w-full rounded-lg px-2 py-1.5 text-left text-sm ${
                    coverStyle === c.id ? 'bg-rose-500/20 text-rose-200' : 'text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  {c.label} · {c.desc}
                </button>
              ))}
            </div>
          </div>

          <BookQuestionPicker teacherId={teacherId} selected={pickedQuestions} onChange={setPickedQuestions} />

          <button type="button" className={`${btnSecondary} w-full text-sm`} onClick={applyQuestionsToChapters}>
            按章节自动归类
          </button>
          <button type="button" className={`${btnSecondary} w-full text-sm`} onClick={() => void handleGenerateGraph()} disabled={graphLoading}>
            {graphLoading ? '生成中…' : 'AI 生成知识网络图'}
          </button>

          <p className="text-xs text-slate-500">目录</p>
          {chapters.map((ch, i) => (
            <button
              key={ch.id}
              type="button"
              onClick={() => setSelectedChapter(i)}
              className={`mb-1 block w-full rounded px-2 py-1 text-left text-sm ${
                i === selectedChapter ? 'bg-rose-600/30 text-rose-200' : 'text-slate-400 hover:bg-slate-800'
              }`}
            >
              {ch.title}
            </button>
          ))}
          <button type="button" className="text-xs text-cyan-400" onClick={addChapter}>
            + 添加章节
          </button>
        </aside>

        <section className="min-w-0 flex-1 rounded-2xl border border-slate-700 bg-slate-900/60 p-4">
          {message && <p className="mb-3 text-sm text-blue-300">{message}</p>}

          <KnowledgeGraphView graph={knowledgeGraph ?? null} loading={graphLoading} />

          <div className="my-4 flex flex-wrap gap-2">
            <button type="button" className={btnSecondary} onClick={addSection}>
              + 小节
            </button>
            <button type="button" className={btnSecondary} onClick={() => addBlock('knowledge')}>
              + 知识讲解
            </button>
            <button type="button" className={btnSecondary} onClick={() => addBlock('example')}>
              + 例题
            </button>
            <button type="button" className={btnSecondary} onClick={() => addBlock('exercise')}>
              + 练习
            </button>
            <button type="button" className={btnSecondary} onClick={() => addBlock('summary')}>
              + 总结
            </button>
          </div>

          {chapter?.sections.map((sec: BookSection) => (
            <div key={sec.id} className="mb-4">
              <input
                className={`${inputClass} mb-2 font-semibold text-sm py-2`}
                value={sec.title}
                onChange={(e) => {
                  const next = [...chapters]
                  const s = next[selectedChapter].sections.find((x) => x.id === sec.id)
                  if (s) s.title = e.target.value
                  setChapters(next)
                }}
              />
              {sec.blocks.map((b) => (
                <div key={b.id} className="mb-2 rounded-lg border border-slate-700 p-2">
                  <p className="text-xs text-slate-500">{b.type}</p>
                  <textarea
                    className={`${inputClass} mt-1 text-sm`}
                    rows={3}
                    value={b.content}
                    onChange={(e) => {
                      setChapters(
                        chapters.map((ch, ci) =>
                          ci !== selectedChapter
                            ? ch
                            : {
                                ...ch,
                                sections: ch.sections.map((s) =>
                                  s.id !== sec.id
                                    ? s
                                    : {
                                        ...s,
                                        blocks: s.blocks.map((blk) =>
                                          blk.id === b.id ? { ...blk, content: e.target.value } : blk,
                                        ),
                                      },
                                ),
                              },
                        ),
                      )
                    }}
                  />
                </div>
              ))}
            </div>
          ))}

          <div className="flex flex-wrap gap-2">
            <button type="button" className={btnPrimary} onClick={() => void handleSave()}>
              保存辅导书
            </button>
            <button
              type="button"
              className={btnSecondary}
              onClick={() => exportHtmlAsWord(bookToExportHtml(bookRecord()), title)}
            >
              导出 Word
            </button>
            <button
              type="button"
              className={btnSecondary}
              onClick={() => previewRef.current && exportToPdf(previewRef.current, `${title}.pdf`)}
            >
              导出 PDF
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-500">导出含统一章节标题、页码与封面样式</p>
        </section>

        <section className="hidden w-80 shrink-0 lg:block">
          <p className="mb-2 text-xs text-slate-500">全书预览</p>
          <div
            ref={previewRef}
            className="max-h-[calc(100vh-6rem)] overflow-y-auto rounded-2xl border border-slate-700 bg-white p-4 text-black text-sm"
            dangerouslySetInnerHTML={{ __html: bookToExportHtml(bookRecord()) }}
          />
        </section>
      </main>
    </div>
  )
}
