import { useCallback, useEffect, useState } from 'react'
import DashboardHeader from '../components/layout/DashboardHeader'
import { useAuth } from '../context/AuthContext'
import { fileToBase64 } from '../lib/answerSheetCompress'
import {
  batchImportQuestions,
  batchUpdateTags,
  createQuestion,
  deleteQuestions,
  fetchQuestions,
  submitDecomposeTask,
  updateQuestion,
} from '../lib/teacherApi'
import { Link } from 'react-router-dom'
import type { BankQuestion } from '../types/teacher'
import {
  DIFFICULTIES,
  QUESTION_SOURCES,
  QUESTION_TYPES,
  TEACHER_GRADES,
  TEACHER_SUBJECTS,
  btnPrimary,
  btnSecondary,
  inputClass,
} from '../types/teacher'

const emptyQuestion = (): BankQuestion => ({
  subject: '物理',
  grade: '八年级',
  knowledge_point: '',
  question_type: '选择题',
  difficulty: '中等',
  content: '',
  options: ['A', 'B', 'C', 'D'],
  answer: '',
  analysis: '',
  source: '手动录入',
  tags: [],
})

export default function TeacherQuestionBankPage() {
  const { profile } = useAuth()
  const teacherId = profile?.id ?? ''

  const [items, setItems] = useState<BankQuestion[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [filters, setFilters] = useState({ subject: '', grade: '', question_type: '', difficulty: '', source: '', keyword: '' })
  const [editing, setEditing] = useState<BankQuestion | null>(null)
  const [splitPreview, setSplitPreview] = useState<Partial<BankQuestion>[] | null>(null)
  const [importing, setImporting] = useState(false)

  const load = useCallback(async () => {
    if (!teacherId) return
    setLoading(true)
    try {
      const data = await fetchQuestions(teacherId, { ...filters, page, pageSize: 10 })
      setItems(data.items)
      setTotal(data.total)
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [teacherId, filters, page])

  useEffect(() => {
    load()
  }, [load])

  const handleSave = async () => {
    if (!editing || !teacherId) return
    try {
      if (editing.id) await updateQuestion(teacherId, editing.id, editing)
      else await createQuestion(teacherId, editing)
      setEditing(null)
      setMessage('保存成功')
      load()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '保存失败')
    }
  }

  const handleImportFile = async (file: File) => {
    if (!teacherId) return
    setImporting(true)
    setMessage(null)
    try {
      const base64 = await fileToBase64(file)
      const result = await submitDecomposeTask(
        teacherId,
        base64,
        file.name,
        filters.subject || '物理',
        filters.grade || '八年级',
      )
      if (!result.success) {
        throw new Error(result.message || '提交拆题任务失败')
      }
      setMessage('任务已提交，正在后台处理，可稍后查看')
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '提交失败')
    } finally {
      setImporting(false)
    }
  }

  const confirmImport = async () => {
    if (!splitPreview || !teacherId) return
    try {
      await batchImportQuestions(teacherId, splitPreview)
      setSplitPreview(null)
      setMessage('批量入库成功')
      load()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '入库失败')
    }
  }

  const pageCount = Math.max(1, Math.ceil(total / 10))

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <DashboardHeader title="我的题库" backTo="/teacher/dashboard" backLabel="返回工作台" featureNavRole="teacher" />
      <main className="mx-auto max-w-6xl px-4 py-6">
        {message && <p className="mb-4 rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-sm text-blue-200">{message}</p>}

        <div className="mb-4 flex flex-wrap gap-2">
          <select className={`${inputClass} w-auto`} value={filters.subject} onChange={(e) => setFilters({ ...filters, subject: e.target.value })}>
            <option value="">全部学科</option>
            {TEACHER_SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className={`${inputClass} w-auto`} value={filters.grade} onChange={(e) => setFilters({ ...filters, grade: e.target.value })}>
            <option value="">全部年级</option>
            {TEACHER_GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
          <select className={`${inputClass} w-auto`} value={filters.question_type} onChange={(e) => setFilters({ ...filters, question_type: e.target.value })}>
            <option value="">全部题型</option>
            {QUESTION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select className={`${inputClass} w-auto`} value={filters.difficulty} onChange={(e) => setFilters({ ...filters, difficulty: e.target.value })}>
            <option value="">全部难度</option>
            {DIFFICULTIES.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <select className={`${inputClass} w-auto`} value={filters.source} onChange={(e) => setFilters({ ...filters, source: e.target.value })}>
            <option value="">全部来源</option>
            {QUESTION_SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <input className={`${inputClass} min-w-[160px] flex-1`} placeholder="搜索题目内容" value={filters.keyword} onChange={(e) => setFilters({ ...filters, keyword: e.target.value })} />
          <button type="button" className={btnSecondary} onClick={() => { setPage(1); load() }}>筛选</button>
          <button type="button" className={btnPrimary} onClick={() => setEditing(emptyQuestion())}>+ 单题添加</button>
          <label className={`${btnSecondary} cursor-pointer ${importing ? 'opacity-60 pointer-events-none' : ''}`}>
            {importing ? '提交中...' : '上传试卷拆题'}
            <input type="file" accept=".docx,.pdf" className="hidden" onChange={(e) => e.target.files?.[0] && handleImportFile(e.target.files[0])} />
          </label>
          <Link to="/teacher/task-center" className={btnSecondary}>查看拆题任务</Link>
        </div>

        {selected.length > 0 && (
          <div className="mb-4 flex gap-2">
            <button type="button" className={btnSecondary} onClick={async () => {
              if (!teacherId) return
              await deleteQuestions(teacherId, selected)
              setSelected([])
              load()
            }}>批量删除 ({selected.length})</button>
            <button type="button" className={btnSecondary} onClick={async () => {
              const tag = prompt('输入标签（逗号分隔）')
              if (!tag || !teacherId) return
              await batchUpdateTags(teacherId, selected, tag.split(',').map((t) => t.trim()))
              setSelected([])
              load()
            }}>批量改标签</button>
          </div>
        )}

        <div className="overflow-x-auto rounded-xl border border-slate-700">
          <table className="w-full min-w-[800px] text-left text-sm">
            <thead className="bg-slate-800/80 text-slate-400">
              <tr>
                <th className="p-3"><input type="checkbox" checked={selected.length === items.length && items.length > 0} onChange={(e) => setSelected(e.target.checked ? items.map((i) => i.id!).filter(Boolean) : [])} /></th>
                <th className="p-3">学科</th>
                <th className="p-3">题型</th>
                <th className="p-3">难度</th>
                <th className="p-3">题目内容</th>
                <th className="p-3">来源</th>
                <th className="p-3">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="p-6 text-center text-slate-500">加载中...</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={7} className="p-6 text-center text-slate-500">暂无题目，请添加或导入试卷</td></tr>
              ) : items.map((q) => (
                <tr key={q.id} className="border-t border-slate-800 hover:bg-slate-900/50">
                  <td className="p-3"><input type="checkbox" checked={selected.includes(q.id!)} onChange={(e) => setSelected(e.target.checked ? [...selected, q.id!] : selected.filter((id) => id !== q.id))} /></td>
                  <td className="p-3">{q.subject}</td>
                  <td className="p-3">{q.question_type}</td>
                  <td className="p-3">{q.difficulty}</td>
                  <td className="max-w-xs truncate p-3">{q.content}</td>
                  <td className="p-3">{q.source}</td>
                  <td className="p-3"><button type="button" className="text-cyan-400 hover:underline" onClick={() => setEditing(q)}>编辑</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex items-center justify-between text-sm text-slate-400">
          <span>共 {total} 题</span>
          <div className="flex gap-2">
            <button type="button" disabled={page <= 1} className={btnSecondary} onClick={() => setPage((p) => p - 1)}>上一页</button>
            <span>{page} / {pageCount}</span>
            <button type="button" disabled={page >= pageCount} className={btnSecondary} onClick={() => setPage((p) => p + 1)}>下一页</button>
          </div>
        </div>

        {editing && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-6">
              <h3 className="mb-4 text-lg font-semibold">{editing.id ? '编辑题目' : '添加题目'}</h3>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <select className={inputClass} value={editing.subject} onChange={(e) => setEditing({ ...editing, subject: e.target.value })}>{TEACHER_SUBJECTS.map((s) => <option key={s}>{s}</option>)}</select>
                  <select className={inputClass} value={editing.grade} onChange={(e) => setEditing({ ...editing, grade: e.target.value })}>{TEACHER_GRADES.map((g) => <option key={g}>{g}</option>)}</select>
                  <select className={inputClass} value={editing.question_type} onChange={(e) => setEditing({ ...editing, question_type: e.target.value })}>{QUESTION_TYPES.map((t) => <option key={t}>{t}</option>)}</select>
                  <select className={inputClass} value={editing.difficulty} onChange={(e) => setEditing({ ...editing, difficulty: e.target.value })}>{DIFFICULTIES.map((d) => <option key={d}>{d}</option>)}</select>
                </div>
                <input className={inputClass} placeholder="知识点" value={editing.knowledge_point} onChange={(e) => setEditing({ ...editing, knowledge_point: e.target.value })} />
                <textarea className={inputClass} rows={4} placeholder="题目内容" value={editing.content} onChange={(e) => setEditing({ ...editing, content: e.target.value })} />
                <input className={inputClass} placeholder="正确答案" value={editing.answer} onChange={(e) => setEditing({ ...editing, answer: e.target.value })} />
                <textarea className={inputClass} rows={3} placeholder="解析" value={editing.analysis} onChange={(e) => setEditing({ ...editing, analysis: e.target.value })} />
                <input className={inputClass} placeholder="标签（逗号分隔）" value={editing.tags.join(',')} onChange={(e) => setEditing({ ...editing, tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean) })} />
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <button type="button" className={btnSecondary} onClick={() => setEditing(null)}>取消</button>
                <button type="button" className={btnPrimary} onClick={handleSave}>保存</button>
              </div>
            </div>
          </div>
        )}

        {splitPreview && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-6">
              <h3 className="mb-4 text-lg font-semibold">拆题结果确认（{splitPreview.length} 道）</h3>
              <div className="space-y-3">
                {splitPreview.map((q, i) => (
                  <div key={i} className="rounded-lg border border-slate-700 p-3">
                    <p className="text-xs text-slate-500">{q.question_type} · {q.difficulty} · {q.knowledge_point}</p>
                    <textarea className={`${inputClass} mt-2`} rows={2} value={q.content} onChange={(e) => {
                      const next = [...splitPreview]
                      next[i] = { ...q, content: e.target.value }
                      setSplitPreview(next)
                    }} />
                  </div>
                ))}
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <button type="button" className={btnSecondary} onClick={() => setSplitPreview(null)}>取消</button>
                <button type="button" className={btnPrimary} onClick={confirmImport}>确认入库</button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
