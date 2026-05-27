import { useRef, useState } from 'react'
import DashboardHeader from '../components/layout/DashboardHeader'
import { useAuth } from '../context/AuthContext'
import { exportHtmlAsWord } from '../lib/exportDoc'
import { exportToPdf } from '../lib/exportPdf'
import { saveBook } from '../lib/teacherApi'
import type { BookChapter, BookSection } from '../types/teacher'
import { btnPrimary, btnSecondary, inputClass } from '../types/teacher'

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
  const [chapters, setChapters] = useState<BookChapter[]>([
    { id: newId('ch'), title: '第一章', sections: [{ id: newId('sec'), title: '第一节', blocks: [] }] },
  ])
  const [selectedChapter, setSelectedChapter] = useState(0)
  const [message, setMessage] = useState<string | null>(null)

  const chapter = chapters[selectedChapter]

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
    const sec = next[selectedChapter].sections[0] ?? { id: newId('sec'), title: '默认小节', blocks: [] }
    if (!next[selectedChapter].sections.length) next[selectedChapter].sections = [sec]
    sec.blocks.push({ id: newId('blk'), type, title: type === 'knowledge' ? '知识讲解' : type === 'example' ? '例题' : type === 'exercise' ? '练习' : '本章总结', content: '' })
    setChapters(next)
  }

  const handleSave = async () => {
    if (!teacherId) return
    try {
      await saveBook(teacherId, { title, grade, level, chapters })
      setMessage('辅导书已保存')
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '保存失败')
    }
  }

  const bookHtml = () => {
    let html = `<h1>${title}</h1><p>${grade} · ${level}</p>`
    for (const ch of chapters) {
      html += `<h2>${ch.title}</h2>`
      for (const sec of ch.sections) {
        html += `<h3>${sec.title}</h3>`
        for (const b of sec.blocks) {
          html += `<h4>${b.title}</h4><p>${b.content.replace(/\n/g, '<br/>')}</p>`
        }
      }
    }
    return html
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <DashboardHeader title="辅导书制作" backTo="/teacher/dashboard" backLabel="返回工作台" featureNavRole="teacher" />
      <main className="mx-auto flex max-w-6xl gap-4 px-4 py-6">
        <aside className="w-64 shrink-0 rounded-2xl border border-slate-700 bg-slate-900/60 p-3">
          <input className={`${inputClass} mb-2 text-sm`} value={title} onChange={(e) => setTitle(e.target.value)} />
          <input className={`${inputClass} mb-2 text-sm`} value={grade} onChange={(e) => setGrade(e.target.value)} placeholder="年级" />
          <select className={`${inputClass} mb-3 text-sm`} value={level} onChange={(e) => setLevel(e.target.value)}>
            <option>基础</option><option>提高</option><option>竞赛</option>
          </select>
          <p className="mb-2 text-xs text-slate-500">目录</p>
          {chapters.map((ch, i) => (
            <button key={ch.id} type="button" onClick={() => setSelectedChapter(i)} className={`mb-1 block w-full rounded px-2 py-1 text-left text-sm ${i === selectedChapter ? 'bg-blue-600/30 text-blue-200' : 'text-slate-400 hover:bg-slate-800'}`}>
              {ch.title}
            </button>
          ))}
          <button type="button" className="mt-2 text-xs text-cyan-400" onClick={addChapter}>+ 添加章节</button>
        </aside>
        <section className="flex-1 rounded-2xl border border-slate-700 bg-slate-900/60 p-4">
          {message && <p className="mb-3 text-sm text-blue-300">{message}</p>}
          <div className="mb-4 flex flex-wrap gap-2">
            <button type="button" className={btnSecondary} onClick={addSection}>+ 小节</button>
            <button type="button" className={btnSecondary} onClick={() => addBlock('knowledge')}>+ 知识讲解</button>
            <button type="button" className={btnSecondary} onClick={() => addBlock('example')}>+ 例题</button>
            <button type="button" className={btnSecondary} onClick={() => addBlock('exercise')}>+ 练习</button>
            <button type="button" className={btnSecondary} onClick={() => addBlock('summary')}>+ 总结</button>
          </div>
          {chapter?.sections.map((sec: BookSection) => (
            <div key={sec.id} className="mb-4">
              <input className={`${inputClass} mb-2 font-semibold`} value={sec.title} onChange={(e) => {
                const next = [...chapters]
                const s = next[selectedChapter].sections.find((x) => x.id === sec.id)
                if (s) s.title = e.target.value
                setChapters(next)
              }} />
              {sec.blocks.map((b) => (
                <div key={b.id} className="mb-2 rounded-lg border border-slate-700 p-2">
                  <p className="text-xs text-slate-500">{b.type}</p>
                  <textarea className={`${inputClass} mt-1`} rows={3} value={b.content} onChange={(e) => {
                    b.content = e.target.value
                    setChapters([...chapters])
                  }} />
                </div>
              ))}
            </div>
          ))}
          <div className="flex gap-2">
            <button type="button" className={btnPrimary} onClick={handleSave}>保存辅导书</button>
            <button type="button" className={btnSecondary} onClick={() => exportHtmlAsWord(bookHtml(), title)}>导出 Word</button>
            <button type="button" className={btnSecondary} onClick={() => previewRef.current && exportToPdf(previewRef.current, `${title}.pdf`)}>导出 PDF</button>
          </div>
        </section>
        <section ref={previewRef} className="hidden w-80 rounded-2xl border border-slate-700 bg-white p-4 text-black lg:block">
          <div dangerouslySetInnerHTML={{ __html: bookHtml() }} />
        </section>
      </main>
    </div>
  )
}
