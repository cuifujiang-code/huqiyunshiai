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
  const [leftCollapsed, setLeftCollapsed] = useState(false)
  const [rightCollapsed, setRightCollapsed] = useState(false)

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
    <div className="min-h-screen bg-[#121722] text-[#E8ECF3]">
      <DashboardHeader title="教辅书制作" backTo="/teacher/dashboard" backLabel="返回工作台" featureNavRole="teacher" />

      <main className="mx-auto flex max-w-[1600px] gap-3 px-4 py-4" style={{ height: 'calc(100vh - 140px)' }}>
        {/* 左栏：封面设置 + 选题筛选 */}
        <aside
          className={`flex shrink-0 flex-col gap-3 overflow-y-auto rounded-[12px] border border-white/[0.06] bg-[#1C2332] p-3 transition-all ${
            leftCollapsed ? 'w-10 p-2' : 'w-64'
          }`}
        >
          <div className="flex items-center justify-between">
            {!leftCollapsed && <span className="text-xs font-semibold uppercase tracking-wider text-[#8A94A9]">封面设置</span>}
            <button
              type="button"
              onClick={() => setLeftCollapsed(!leftCollapsed)}
              className="rounded p-1 text-xs text-[#8A94A9] hover:text-[#E8ECF3]"
            >
              {leftCollapsed ? '▶' : '◀'}
            </button>
          </div>

          {!leftCollapsed && (
            <>
              <input
                className={`${inputClass} text-sm`}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="书名"
              />
              <input
                className={`${inputClass} text-sm`}
                value={grade}
                onChange={(e) => setGrade(e.target.value)}
                placeholder="年级"
              />
              <select
                className={`${inputClass} text-sm`}
                value={level}
                onChange={(e) => setLevel(e.target.value)}
              >
                <option>基础</option>
                <option>提高</option>
                <option>竞赛</option>
              </select>

              <div className="space-y-1">
                <p className="text-[11px] text-[#8A94A9]">封面风格</p>
                {COVER_OPTIONS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCoverStyle(c.id)}
                    className={`w-full rounded-[8px] px-2 py-1.5 text-left text-xs transition ${
                      coverStyle === c.id
                        ? 'bg-[#2584FF]/15 text-[#5C9DFF] ring-1 ring-[#2584FF]/30'
                        : 'text-[#8A94A9] hover:bg-[#222B3E]'
                    }`}
                  >
                    {c.label} · {c.desc}
                  </button>
                ))}
              </div>

              <div className="h-px bg-white/[0.06]" />

              <BookQuestionPicker teacherId={teacherId} selected={pickedQuestions} onChange={setPickedQuestions} />

              <button type="button" className={`${btnSecondary} w-full text-xs`} onClick={applyQuestionsToChapters}>
                按章节自动归类
              </button>
              <button
                type="button"
                className={`${btnSecondary} w-full text-xs`}
                onClick={() => void handleGenerateGraph()}
                disabled={graphLoading}
              >
                {graphLoading ? '生成中…' : 'AI 生成知识网络图'}
              </button>
            </>
          )}
        </aside>

        {/* 中栏：章节编辑 */}
        <section className="flex flex-1 flex-col min-w-0 overflow-hidden rounded-[12px] border border-white/[0.06] bg-[#1C2332]">
          {/* 章节 Tab 切换 */}
          <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-white/[0.06] px-3 py-2">
            {chapters.map((ch, i) => (
              <button
                key={ch.id}
                type="button"
                onClick={() => setSelectedChapter(i)}
                className={`shrink-0 rounded-[6px] px-3 py-1.5 text-xs font-medium transition ${
                  i === selectedChapter
                    ? 'bg-[#2584FF] text-white'
                    : 'text-[#8A94A9] hover:bg-[#222B3E] hover:text-[#E8ECF3]'
                }`}
              >
                {ch.title}
              </button>
            ))}
            <button type="button" onClick={addChapter} className="shrink-0 rounded-[6px] px-2 py-1.5 text-xs text-[#2584FF] hover:bg-[#2584FF]/10">
              + 章节
            </button>
          </div>

          {/* 操作栏 */}
          <div className="flex shrink-0 flex-wrap gap-1.5 border-b border-white/[0.06] px-3 py-2">
            <button type="button" className={btnSecondary} onClick={addSection}>+ 小节</button>
            <button type="button" className={btnSecondary} onClick={() => addBlock('knowledge')}>+ 知识</button>
            <button type="button" className={btnSecondary} onClick={() => addBlock('example')}>+ 例题</button>
            <button type="button" className={btnSecondary} onClick={() => addBlock('exercise')}>+ 练习</button>
            <button type="button" className={btnSecondary} onClick={() => addBlock('summary')}>+ 总结</button>
          </div>

          {/* 内容编辑区 */}
          <div className="flex-1 overflow-y-auto p-4">
            {message && (
              <p className="mb-3 rounded-[8px] border border-[#2584FF]/20 bg-[#2584FF]/10 px-3 py-2 text-sm text-[#5C9DFF]">
                {message}
              </p>
            )}

            <KnowledgeGraphView graph={knowledgeGraph ?? null} loading={graphLoading} />

            {chapter?.sections.map((sec: BookSection) => (
              <div key={sec.id} className="mb-4">
                <input
                  className={`${inputClass} mb-2 font-semibold text-sm`}
                  value={sec.title}
                  onChange={(e) => {
                    const next = [...chapters]
                    const s = next[selectedChapter].sections.find((x) => x.id === sec.id)
                    if (s) s.title = e.target.value
                    setChapters(next)
                  }}
                />
                {sec.blocks.map((b) => (
                  <div key={b.id} className="mb-2 rounded-[8px] border border-white/[0.06] bg-[#222B3E] p-2">
                    <p className="text-[11px] text-[#8A94A9]">{b.title}</p>
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

            {/* 底部操作按钮 */}
            <div className="flex flex-wrap gap-2 border-t border-white/[0.06] pt-3">
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
            <p className="mt-2 text-[11px] text-[#8A94A9]">导出含统一章节标题、页码与封面样式</p>
          </div>
        </section>

        {/* 右栏：预览 */}
        <aside
          className={`shrink-0 overflow-hidden rounded-[12px] border border-white/[0.06] bg-[#1C2332] transition-all ${
            rightCollapsed ? 'w-10 p-1' : 'w-72 p-3'
          }`}
        >
          <div className="flex items-center justify-between">
            {!rightCollapsed && <span className="text-xs font-semibold uppercase tracking-wider text-[#8A94A9]">全书预览</span>}
            <button
              type="button"
              onClick={() => setRightCollapsed(!rightCollapsed)}
              className="rounded p-1 text-xs text-[#8A94A9] hover:text-[#E8ECF3]"
            >
              {rightCollapsed ? '◀' : '▶'}
            </button>
          </div>

          {!rightCollapsed && (
            <div
              ref={previewRef}
              className="mt-2 max-h-[calc(100vh-12rem)] overflow-y-auto rounded-[8px] bg-white p-4 text-sm text-black"
              dangerouslySetInnerHTML={{ __html: bookToExportHtml(bookRecord()) }}
            />
          )}
        </aside>
      </main>
    </div>
  )
}
