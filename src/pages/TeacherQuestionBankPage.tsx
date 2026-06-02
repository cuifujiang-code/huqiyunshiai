import { useCallback, useEffect, useState } from 'react'
import DashboardHeader from '../components/layout/DashboardHeader'
import MathRenderer from '../components/common/MathRenderer'
import { useAuth } from '../context/AuthContext'
import { fileToBase64 } from '../lib/fileBase64'
import {
  batchImportQuestions,
  batchUpdateTags,
  batchUpdateVisibility,
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
  SUBJECT_QUESTION_TYPES,
  TEACHER_GRADES,
  TEACHER_SUBJECTS,
  ALL_QUESTION_TYPES,
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
  visibility: 'personal',
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
  const [filters, setFilters] = useState({
    subject: '',
    grade: '',
    question_type: '',
    difficulty: '',
    source: '',
    keyword: '',
    visibility: 'personal' as 'personal' | 'public',
  })
  const [editing, setEditing] = useState<BankQuestion | null>(null)
  const [splitPreview, setSplitPreview] = useState<Partial<BankQuestion>[] | null>(null)
  const [importing, setImporting] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // 根据当前筛选科目获取题型列表
  const questionTypes = filters.subject
    ? (SUBJECT_QUESTION_TYPES[filters.subject] || ALL_QUESTION_TYPES)
    : ALL_QUESTION_TYPES

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

  const handleVisibilityChange = async (ids: string[], vis: 'personal' | 'public') => {
    if (!teacherId) return
    try {
      await batchUpdateVisibility(teacherId, ids, vis)
      setSelected([])
      setMessage(vis === 'public' ? '已移至公域题库' : '已移至个人题库')
      load()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '操作失败')
    }
  }

  const pageCount = Math.max(1, Math.ceil(total / 10))
  const isPublicTab = filters.visibility === 'public'

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <DashboardHeader title="我的题库" backTo="/teacher/dashboard" backLabel="返回工作台" featureNavRole="teacher" />
      <main className="mx-auto max-w-6xl px-4 py-6">
        {message && <p className="mb-4 rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-sm text-blue-200">{message}</p>}

        {/* 个人/公域 Tab 切换 */}
        <div className="mb-4 flex items-center gap-1 rounded-xl bg-slate-800/80 p-1 w-fit">
          <button
            type="button"
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              !isPublicTab ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
            onClick={() => { setFilters({ ...filters, visibility: 'personal' }); setPage(1); setSelected([]) }}
          >
            我的题库
          </button>
          <button
            type="button"
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              isPublicTab ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
            onClick={() => { setFilters({ ...filters, visibility: 'public' }); setPage(1); setSelected([]) }}
          >
            公域题库
          </button>
        </div>

        {/* 筛选栏 */}
        <div className="mb-4 flex flex-wrap gap-2">
          <select className={`${inputClass} w-auto`} value={filters.subject} onChange={(e) => setFilters({ ...filters, subject: e.target.value, question_type: '' })}>
            <option value="">全部学科</option>
            {TEACHER_SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className={`${inputClass} w-auto`} value={filters.grade} onChange={(e) => setFilters({ ...filters, grade: e.target.value })}>
            <option value="">全部年级</option>
            {TEACHER_GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
          <select className={`${inputClass} w-auto`} value={filters.question_type} onChange={(e) => setFilters({ ...filters, question_type: e.target.value })}>
            <option value="">全部题型</option>
            {questionTypes.map((t) => <option key={t} value={t}>{t}</option>)}
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
          {!isPublicTab && (
            <>
              <button type="button" className={btnPrimary} onClick={() => setEditing(emptyQuestion())}>+ 单题添加</button>
              <label className={`${btnSecondary} cursor-pointer ${importing ? 'opacity-60 pointer-events-none' : ''}`}>
                {importing ? '提交中...' : '上传试卷拆题'}
                <input type="file" accept=".docx,.pdf" className="hidden" onChange={(e) => e.target.files?.[0] && handleImportFile(e.target.files[0])} />
              </label>
            </>
          )}
          <Link to="/teacher/task-center" className={btnSecondary}>查看拆题任务</Link>
          <Link to="/teacher/batch-upload" className={btnPrimary}>大批量拆题（100～1000题）</Link>
        </div>

        {/* 批量操作栏 */}
        {selected.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-2">
            {!isPublicTab && (
              <>
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
                <button type="button" className={`${btnSecondary} text-emerald-400 border-emerald-600/30`} onClick={() => handleVisibilityChange(selected, 'public')}>
                  移至公域
                </button>
              </>
            )}
            {isPublicTab && (
              <button type="button" className={`${btnSecondary} text-amber-400 border-amber-600/30`} onClick={() => handleVisibilityChange(selected, 'personal')}>
                移至个人 ({selected.length})
              </button>
            )}
          </div>
        )}

        {/* 题目列表 */}
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
                {isPublicTab && <th className="p-3">上传者</th>}
                <th className="p-3">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={isPublicTab ? 8 : 7} className="p-6 text-center text-slate-500">加载中...</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={isPublicTab ? 8 : 7} className="p-6 text-center text-slate-500">
                  {isPublicTab ? '公域题库暂无题目' : '暂无题目，请添加或导入试卷'}
                </td></tr>
              ) : items.map((q) => {
                const isExpanded = expandedId === q.id
                return (
                  <tr key={q.id} className={`border-t border-slate-800 hover:bg-slate-900/50 ${isExpanded ? 'bg-slate-800/40' : ''}`}>
                    <td className="p-3"><input type="checkbox" checked={selected.includes(q.id!)} onChange={(e) => setSelected(e.target.checked ? [...selected, q.id!] : selected.filter((id) => id !== q.id))} /></td>
                    <td className="p-3">{q.subject}</td>
                    <td className="p-3">{q.question_type}</td>
                    <td className="p-3">{q.difficulty}</td>
                    <td className="max-w-xs p-3">
                      <div
                        className="cursor-pointer truncate"
                        onClick={() => setExpandedId(isExpanded ? null : q.id!)}
                        title="点击展开查看完整题目"
                      >
                        {isExpanded ? (
                          <div className="whitespace-normal">
                            <MathRenderer text={q.content} className="text-xs leading-relaxed" />
                            {/* 展开后显示选项 */}
                            {q.options && q.options.length > 0 && (
                              <div className="mt-2 grid grid-cols-2 gap-1 text-xs">
                                {q.options.map((opt, oi) => (
                                  <span key={oi} className="rounded bg-slate-700/50 px-2 py-0.5">
                                    <MathRenderer text={opt} />
                                  </span>
                                ))}
                              </div>
                            )}
                            {/* 展开后显示答案和解析 */}
                            <div className="mt-2 space-y-1 text-xs">
                              <div className="text-green-400">
                                <span className="font-semibold">答案：</span>
                                <MathRenderer text={q.answer} />
                              </div>
                              {q.analysis && q.analysis !== '暂无' && (
                                <div className="text-blue-400">
                                  <span className="font-semibold">解析：</span>
                                  <MathRenderer text={q.analysis} />
                                </div>
                              )}
                              {q.knowledge_point && (
                                <div className="text-slate-500">知识点：{q.knowledge_point}</div>
                              )}
                            </div>
                            <span className="text-xs text-slate-500">点击收起</span>
                          </div>
                        ) : (
                          <span>
                            {q.content.replace(/<[^>]+>/g, '').slice(0, 60)}
                            {(q.content.length > 60 || /【公式】|\$|\\/.test(q.content)) ? '…' : ''}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-3">{q.source}</td>
                    {isPublicTab && (
                      <td className="p-3 text-xs text-slate-400">{q.teacher_id?.slice(0, 8) || '未知'}</td>
                    )}
                    <td className="p-3">
                      {!isPublicTab && (
                        <button type="button" className="text-cyan-400 hover:underline" onClick={() => setEditing(q)}>编辑</button>
                      )}
                      {isPublicTab && (
                        <button type="button" className="text-emerald-400 hover:underline" onClick={() => setEditing(q)}>查看</button>
                      )}
                    </td>
                  </tr>
                )
              })}
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

        {/* 编辑/添加弹窗 */}
        {editing && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-6">
              <h3 className="mb-4 text-lg font-semibold">
                {editing.id ? (isPublicTab ? '查看题目' : '编辑题目') : '添加题目'}
              </h3>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <select
                    className={inputClass}
                    value={editing.subject}
                    onChange={(e) => setEditing({ ...editing, subject: e.target.value, question_type: '' })}
                    disabled={isPublicTab}
                  >
                    {TEACHER_SUBJECTS.map((s) => <option key={s}>{s}</option>)}
                  </select>
                  <select className={inputClass} value={editing.grade} onChange={(e) => setEditing({ ...editing, grade: e.target.value })} disabled={isPublicTab}>
                    {TEACHER_GRADES.map((g) => <option key={g}>{g}</option>)}
                  </select>
                  <select
                    className={inputClass}
                    value={editing.question_type}
                    onChange={(e) => setEditing({ ...editing, question_type: e.target.value })}
                    disabled={isPublicTab}
                  >
                    {(SUBJECT_QUESTION_TYPES[editing.subject] || ALL_QUESTION_TYPES).map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                  <select className={inputClass} value={editing.difficulty} onChange={(e) => setEditing({ ...editing, difficulty: e.target.value })} disabled={isPublicTab}>
                    {DIFFICULTIES.map((d) => <option key={d}>{d}</option>)}
                  </select>
                </div>
                <input className={inputClass} placeholder="知识点" value={editing.knowledge_point} onChange={(e) => setEditing({ ...editing, knowledge_point: e.target.value })} disabled={isPublicTab} />
                <textarea className={inputClass} rows={4} placeholder="题目内容（支持 LaTeX: $...$ 行内公式, $$...$$ 独立公式）" value={editing.content} onChange={(e) => setEditing({ ...editing, content: e.target.value })} disabled={isPublicTab} />
                <div>
                  <label className="mb-1 block text-xs text-slate-400">内容预览（公式渲染）</label>
                  <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-3 text-sm">
                    <MathRenderer text={editing.content} />
                  </div>
                </div>
                <input className={inputClass} placeholder="正确答案（支持 LaTeX）" value={editing.answer} onChange={(e) => setEditing({ ...editing, answer: e.target.value })} disabled={isPublicTab} />
                <textarea className={inputClass} rows={3} placeholder="解析（支持 LaTeX）" value={editing.analysis} onChange={(e) => setEditing({ ...editing, analysis: e.target.value })} disabled={isPublicTab} />
                <input className={inputClass} placeholder="标签（逗号分隔）" value={editing.tags.join(',')} onChange={(e) => setEditing({ ...editing, tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean) })} disabled={isPublicTab} />
                {!isPublicTab && (
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-slate-400">可见性：</label>
                    <select
                      className={`${inputClass} w-auto`}
                      value={editing.visibility || 'personal'}
                      onChange={(e) => setEditing({ ...editing, visibility: e.target.value as 'personal' | 'public' })}
                    >
                      <option value="personal">个人题库</option>
                      <option value="public">公域题库</option>
                    </select>
                  </div>
                )}
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <button type="button" className={btnSecondary} onClick={() => setEditing(null)}>
                  {isPublicTab ? '关闭' : '取消'}
                </button>
                {!isPublicTab && (
                  <button type="button" className={btnPrimary} onClick={handleSave}>保存</button>
                )}
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
