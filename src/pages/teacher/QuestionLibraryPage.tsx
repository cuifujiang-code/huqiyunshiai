import { useCallback, useEffect, useRef, useState } from 'react'
import DashboardHeader from '../../components/layout/DashboardHeader'
import BatchQuestionCard from '../../components/batch/BatchQuestionCard'
import QuestionBasket from '../../components/batch/QuestionBasket'
import MathRenderer from '../../components/MathRenderer'
import { useAuth } from '../../context/AuthContext'
import {
  addQuestionToCatalog,
  createCatalogGroup,
  createCatalogItem,
  deleteCatalogGroup,
  deleteCatalogItem,
  fetchCatalogGroups,
  fetchCatalogItems,
  fetchCatalogQuestionIds,
  renameCatalogGroup,
  renameCatalogItem,
  type CatalogGroup,
  type CatalogItem,
} from '../../lib/catalogApi'
import { fetchQuestions, updateQuestion } from '../../lib/teacherApi'
import type { BankQuestion } from '../../types/teacher'
import {
  DIFFICULTIES,
  SUBJECT_QUESTION_TYPES,
  TEACHER_GRADES,
  TEACHER_SUBJECTS,
  ALL_QUESTION_TYPES,
  btnPrimary,
  btnSecondary,
  inputClass,
} from '../../types/teacher'

type ContextMenuTarget =
  | { kind: 'group'; id: string; name: string }
  | { kind: 'item'; id: string; name: string; groupId: string }

export default function QuestionLibraryPage() {
  const { profile } = useAuth()
  const userId = profile?.id ?? ''

  const [groups, setGroups] = useState<CatalogGroup[]>([])
  const [itemsByGroup, setItemsByGroup] = useState<Record<string, CatalogItem[]>>({})
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [selectedCatalogId, setSelectedCatalogId] = useState<string | null>(null)
  const [catalogQuestionIds, setCatalogQuestionIds] = useState<Set<string>>(new Set())

  const [questions, setQuestions] = useState<BankQuestion[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [editing, setEditing] = useState<BankQuestion | null>(null)
  const [dragQuestionId, setDragQuestionId] = useState<string | null>(null)
  const [dropTargetId, setDropTargetId] = useState<string | null>(null)

  const [filters, setFilters] = useState({
    subject: '',
    grade: '',
    question_type: '',
    difficulty: '',
    keyword: '',
    visibility: 'personal' as 'personal' | 'public',
  })

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; target: ContextMenuTarget } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const questionTypes = filters.subject
    ? (SUBJECT_QUESTION_TYPES[filters.subject] || ALL_QUESTION_TYPES)
    : ALL_QUESTION_TYPES

  const pageSize = 8
  const pageCount = Math.max(1, Math.ceil(total / pageSize))

  const loadGroups = useCallback(async () => {
    if (!userId) return
    try {
      const list = await fetchCatalogGroups(userId)
      setGroups(list)
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '加载目录组失败')
    }
  }, [userId])

  const loadItems = useCallback(async (groupId: string) => {
    try {
      const items = await fetchCatalogItems(groupId)
      setItemsByGroup((prev) => ({ ...prev, [groupId]: items }))
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '加载子目录失败')
    }
  }, [])

  const loadCatalogFilter = useCallback(async (catalogId: string | null) => {
    if (!catalogId) {
      setCatalogQuestionIds(new Set())
      return
    }
    try {
      const ids = await fetchCatalogQuestionIds(catalogId)
      setCatalogQuestionIds(new Set(ids))
    } catch {
      setCatalogQuestionIds(new Set())
    }
  }, [])

  const loadQuestions = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    try {
      const data = await fetchQuestions(userId, { ...filters, page, pageSize })
      let list = data.items
      if (selectedCatalogId && catalogQuestionIds.size > 0) {
        list = list.filter((q) => q.id && catalogQuestionIds.has(q.id))
      }
      setQuestions(list)
      setTotal(selectedCatalogId ? list.length : data.total)
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '加载题目失败')
    } finally {
      setLoading(false)
    }
  }, [userId, filters, page, pageSize, selectedCatalogId, catalogQuestionIds])

  useEffect(() => { loadGroups() }, [loadGroups])
  useEffect(() => { loadCatalogFilter(selectedCatalogId) }, [selectedCatalogId, loadCatalogFilter])
  useEffect(() => { loadQuestions() }, [loadQuestions])

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setContextMenu(null)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const toggleGroup = async (groupId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(groupId)) next.delete(groupId)
      else next.add(groupId)
      return next
    })
    if (!itemsByGroup[groupId]) await loadItems(groupId)
  }

  const handleNewGroup = async () => {
    const name = prompt('目录组名称（如：高一数学）')
    if (!name?.trim() || !userId) return
    try {
      await createCatalogGroup(userId, name.trim())
      await loadGroups()
      setMessage('目录组已创建')
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '创建失败')
    }
  }

  const handleNewItem = async (groupId: string) => {
    const name = prompt('子目录名称（如：第一章）')
    if (!name?.trim()) return
    try {
      await createCatalogItem(groupId, name.trim())
      await loadItems(groupId)
      setExpandedGroups((prev) => new Set(prev).add(groupId))
      setMessage('子目录已创建')
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '创建失败')
    }
  }

  const handleContextRename = async (target: ContextMenuTarget) => {
    const name = prompt('新名称', target.name)
    if (!name?.trim()) return
    try {
      if (target.kind === 'group') {
        await renameCatalogGroup(target.id, name.trim())
        await loadGroups()
      } else {
        await renameCatalogItem(target.id, name.trim())
        await loadItems(target.groupId)
      }
      setMessage('重命名成功')
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '重命名失败')
    }
    setContextMenu(null)
  }

  const handleContextDelete = async (target: ContextMenuTarget) => {
    if (!confirm(`确定删除「${target.name}」？`)) return
    try {
      if (target.kind === 'group') {
        await deleteCatalogGroup(target.id)
        await loadGroups()
        setItemsByGroup((prev) => {
          const next = { ...prev }
          delete next[target.id]
          return next
        })
      } else {
        await deleteCatalogItem(target.id)
        await loadItems(target.groupId)
        if (selectedCatalogId === target.id) setSelectedCatalogId(null)
      }
      setMessage('已删除')
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '删除失败')
    }
    setContextMenu(null)
  }

  const handleDropOnCatalog = async (catalogId: string, groupId: string) => {
    if (!dragQuestionId) return
    try {
      await addQuestionToCatalog(dragQuestionId, catalogId)
      await loadItems(groupId)
      if (selectedCatalogId === catalogId) await loadCatalogFilter(catalogId)
      setMessage('题目已移入目录')
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '移动失败')
    }
    setDragQuestionId(null)
    setDropTargetId(null)
  }

  const handleSaveEdit = async () => {
    if (!editing?.id || !userId) return
    try {
      await updateQuestion(userId, editing.id, editing)
      setEditing(null)
      setMessage('保存成功')
      loadQuestions()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '保存失败')
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <DashboardHeader title="题库中心" backTo="/teacher/dashboard" backLabel="返回工作台" featureNavRole="teacher" />
      <main className="mx-auto flex h-[calc(100vh-4rem)] max-w-[1400px] gap-0 px-4 py-4">
        {/* 左侧目录树 30% */}
        <aside className="flex w-[30%] min-w-[240px] flex-col rounded-xl border border-slate-700 bg-slate-900/50">
          <div className="border-b border-slate-700 p-3">
            <button type="button" className={`${btnPrimary} w-full text-sm`} onClick={handleNewGroup}>
              + 新建目录组
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {groups.length === 0 ? (
              <p className="p-4 text-center text-xs text-slate-500">暂无目录，点击上方创建</p>
            ) : groups.map((group) => {
              const expanded = expandedGroups.has(group.id)
              const items = itemsByGroup[group.id] ?? []
              return (
                <div key={group.id} className="mb-1">
                  <div
                    className="flex cursor-pointer items-center gap-1 rounded-lg px-2 py-2 hover:bg-slate-800/80"
                    onClick={() => toggleGroup(group.id)}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      setContextMenu({ x: e.clientX, y: e.clientY, target: { kind: 'group', id: group.id, name: group.name } })
                    }}
                  >
                    <span className="text-xs text-slate-500">{expanded ? '▼' : '▶'}</span>
                    <span className="flex-1 truncate text-sm font-medium text-blue-100">{group.name}</span>
                    <button
                      type="button"
                      className="rounded px-1.5 text-xs text-slate-500 hover:bg-slate-700 hover:text-cyan-300"
                      title="新建子目录"
                      onClick={(e) => { e.stopPropagation(); handleNewItem(group.id) }}
                    >
                      +
                    </button>
                  </div>
                  {expanded && (
                    <div className="ml-4 border-l border-slate-700 pl-2">
                      {items.map((item) => (
                        <div
                          key={item.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => { setSelectedCatalogId(item.id); setPage(1) }}
                          onKeyDown={(e) => { if (e.key === 'Enter') { setSelectedCatalogId(item.id); setPage(1) } }}
                          onDragOver={(e) => { e.preventDefault(); setDropTargetId(item.id) }}
                          onDragLeave={() => setDropTargetId(null)}
                          onDrop={(e) => { e.preventDefault(); handleDropOnCatalog(item.id, group.id) }}
                          onContextMenu={(e) => {
                            e.preventDefault()
                            setContextMenu({
                              x: e.clientX,
                              y: e.clientY,
                              target: { kind: 'item', id: item.id, name: item.name, groupId: group.id },
                            })
                          }}
                          className={`mb-0.5 flex items-center justify-between rounded-lg px-2 py-1.5 text-sm transition ${
                            selectedCatalogId === item.id
                              ? 'bg-cyan-500/15 text-cyan-200'
                              : dropTargetId === item.id
                                ? 'bg-emerald-500/20 text-emerald-200'
                                : 'text-slate-300 hover:bg-slate-800/60'
                          }`}
                        >
                          <span className="truncate">📁 {item.name}</span>
                          <span className="ml-2 shrink-0 rounded bg-slate-800 px-1.5 text-xs text-slate-400">
                            {item.question_count ?? 0}
                          </span>
                        </div>
                      ))}
                      {items.length === 0 && (
                        <p className="py-2 text-xs text-slate-600">暂无子目录</p>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </aside>

        {/* 右侧题目列表 70% */}
        <section className="flex w-[70%] flex-col pl-4">
          {message && (
            <p className="mb-3 rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-sm text-blue-200">{message}</p>
          )}

          <div className="mb-3 flex flex-wrap gap-2">
            <select className={`${inputClass} w-auto text-sm`} value={filters.subject} onChange={(e) => setFilters({ ...filters, subject: e.target.value, question_type: '' })}>
              <option value="">全部学科</option>
              {TEACHER_SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select className={`${inputClass} w-auto text-sm`} value={filters.grade} onChange={(e) => setFilters({ ...filters, grade: e.target.value })}>
              <option value="">全部年级</option>
              {TEACHER_GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
            <select className={`${inputClass} w-auto text-sm`} value={filters.question_type} onChange={(e) => setFilters({ ...filters, question_type: e.target.value })}>
              <option value="">全部题型</option>
              {questionTypes.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <select className={`${inputClass} w-auto text-sm`} value={filters.difficulty} onChange={(e) => setFilters({ ...filters, difficulty: e.target.value })}>
              <option value="">全部难度</option>
              {DIFFICULTIES.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            <input
              className={`${inputClass} min-w-[140px] flex-1 text-sm`}
              placeholder="关键词搜索"
              value={filters.keyword}
              onChange={(e) => setFilters({ ...filters, keyword: e.target.value })}
            />
            <button type="button" className={btnSecondary} onClick={() => { setPage(1); loadQuestions() }}>筛选</button>
            {selectedCatalogId && (
              <button type="button" className={btnSecondary} onClick={() => { setSelectedCatalogId(null); setPage(1) }}>
                清除目录筛选
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <p className="py-12 text-center text-slate-500">加载中...</p>
            ) : questions.length === 0 ? (
              <p className="py-12 text-center text-slate-500">暂无题目</p>
            ) : (
              <div className="space-y-4 pr-1">
                {questions.map((q, idx) => (
                  <BatchQuestionCard
                    key={q.id}
                    question={{ ...q, id: q.id! }}
                    index={(page - 1) * pageSize + idx + 1}
                    draggable
                    onEdit={() => setEditing(q)}
                    onDragStart={setDragQuestionId}
                    onDragEnd={() => setDragQuestionId(null)}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="mt-3 flex items-center justify-between border-t border-slate-800 pt-3 text-sm text-slate-400">
            <span>共 {total} 题</span>
            <div className="flex items-center gap-2">
              <button type="button" disabled={page <= 1} className={btnSecondary} onClick={() => setPage((p) => p - 1)}>上一页</button>
              <span>{page} / {pageCount}</span>
              <button type="button" disabled={page >= pageCount} className={btnSecondary} onClick={() => setPage((p) => p + 1)}>下一页</button>
            </div>
          </div>
        </section>
      </main>

      {contextMenu && (
        <div
          ref={menuRef}
          className="fixed z-50 min-w-[120px] rounded-lg border border-slate-600 bg-slate-900 py-1 shadow-xl"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button type="button" className="block w-full px-4 py-2 text-left text-sm hover:bg-slate-800" onClick={() => handleContextRename(contextMenu.target)}>
            重命名
          </button>
          <button type="button" className="block w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-slate-800" onClick={() => handleContextDelete(contextMenu.target)}>
            删除
          </button>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-6">
            <h3 className="mb-4 text-lg font-semibold">编辑题目</h3>
            <textarea className={`${inputClass} mb-3`} rows={4} value={editing.content} onChange={(e) => setEditing({ ...editing, content: e.target.value })} />
            <div className="mb-3 rounded-lg border border-slate-700 bg-slate-800/50 p-3 text-sm">
              <MathRenderer text={editing.content} />
            </div>
            <input className={`${inputClass} mb-3`} placeholder="答案" value={editing.answer} onChange={(e) => setEditing({ ...editing, answer: e.target.value })} />
            <textarea className={`${inputClass} mb-4`} rows={3} placeholder="解析" value={editing.analysis} onChange={(e) => setEditing({ ...editing, analysis: e.target.value })} />
            <div className="flex justify-end gap-2">
              <button type="button" className={btnSecondary} onClick={() => setEditing(null)}>取消</button>
              <button type="button" className={btnPrimary} onClick={handleSaveEdit}>保存</button>
            </div>
          </div>
        </div>
      )}

      <QuestionBasket />
    </div>
  )
}
