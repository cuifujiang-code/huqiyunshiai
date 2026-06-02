import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import DashboardHeader from '../../components/layout/DashboardHeader'
import BatchQuestionCard from '../../components/batch/BatchQuestionCard'
import QuestionBasket from '../../components/batch/QuestionBasket'
import QuestionEditModal from '../../components/QuestionEditModal'
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

type DialogState =
  | { kind: 'none' }
  | { kind: 'newGroup' }
  | { kind: 'newItem'; groupId: string }
  | { kind: 'rename'; target: ContextMenuTarget }
  | { kind: 'delete'; target: ContextMenuTarget }

function catalogLabel(name: string, count: number) {
  return `${name}(${count})`
}

interface CatalogDialogProps {
  open: boolean
  title: string
  label: string
  placeholder?: string
  defaultValue?: string
  confirmLabel?: string
  danger?: boolean
  onConfirm: (value: string) => void
  onCancel: () => void
}

function CatalogInputDialog({
  open,
  title,
  label,
  placeholder,
  defaultValue = '',
  confirmLabel = '确定',
  onConfirm,
  onCancel,
}: CatalogDialogProps) {
  const [value, setValue] = useState(defaultValue)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setValue(defaultValue)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open, defaultValue])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl" role="dialog" aria-modal="true">
        <h3 className="text-lg font-semibold text-white">{title}</h3>
        <label className="mt-4 block text-sm text-slate-400">{label}</label>
        <input
          ref={inputRef}
          className={`${inputClass} mt-2 text-sm`}
          value={value}
          placeholder={placeholder}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && value.trim()) onConfirm(value.trim())
            if (e.key === 'Escape') onCancel()
          }}
        />
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className={btnSecondary} onClick={onCancel}>取消</button>
          <button type="button" className={btnPrimary} disabled={!value.trim()} onClick={() => onConfirm(value.trim())}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

function CatalogConfirmDialog({
  open,
  title,
  label,
  confirmLabel = '删除',
  onConfirm,
  onCancel,
}: Omit<CatalogDialogProps, 'placeholder' | 'defaultValue'> & { onConfirm: () => void }) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-red-500/30 bg-slate-900 p-6 shadow-2xl" role="dialog" aria-modal="true">
        <h3 className="text-lg font-semibold text-white">{title}</h3>
        <p className="mt-3 text-sm leading-relaxed text-slate-300">{label}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className={btnSecondary} onClick={onCancel}>取消</button>
          <button
            type="button"
            className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-500"
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function QuestionLibraryPage() {
  const { profile } = useAuth()
  const userId = profile?.id ?? ''

  const [groups, setGroups] = useState<CatalogGroup[]>([])
  const [itemsByGroup, setItemsByGroup] = useState<Record<string, CatalogItem[]>>({})
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [selectedCatalogId, setSelectedCatalogId] = useState<string | null>(null)
  const [catalogQuestionIds, setCatalogQuestionIds] = useState<Set<string>>(new Set())
  const [catalogSearch, setCatalogSearch] = useState('')

  const [questions, setQuestions] = useState<BankQuestion[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [editing, setEditing] = useState<BankQuestion | null>(null)
  const [dragQuestionId, setDragQuestionId] = useState<string | null>(null)
  const [dropTargetId, setDropTargetId] = useState<string | null>(null)
  const [hoverGroupId, setHoverGroupId] = useState<string | null>(null)

  const [filters, setFilters] = useState({
    subject: '',
    grade: '',
    question_type: '',
    difficulty: '',
    keyword: '',
    visibility: 'personal' as 'personal' | 'public',
  })

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; target: ContextMenuTarget } | null>(null)
  const [dialog, setDialog] = useState<DialogState>({ kind: 'none' })
  const menuRef = useRef<HTMLDivElement>(null)

  const questionTypes = filters.subject
    ? (SUBJECT_QUESTION_TYPES[filters.subject] || ALL_QUESTION_TYPES)
    : ALL_QUESTION_TYPES

  const pageSize = 8
  const pageCount = Math.max(1, Math.ceil(total / pageSize))

  const showToast = useCallback((text: string) => {
    setToast(text)
  }, [])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 1500)
    return () => window.clearTimeout(timer)
  }, [toast])

  const loadAllItems = useCallback(async (groupList: CatalogGroup[]) => {
    const entries = await Promise.all(
      groupList.map(async (g) => {
        try {
          const items = await fetchCatalogItems(g.id)
          return [g.id, items] as const
        } catch {
          return [g.id, [] as CatalogItem[]] as const
        }
      }),
    )
    setItemsByGroup(Object.fromEntries(entries))
  }, [])

  const loadGroups = useCallback(async () => {
    if (!userId) return
    try {
      const list = await fetchCatalogGroups(userId)
      setGroups(list)
      await loadAllItems(list)
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '加载目录组失败')
    }
  }, [userId, loadAllItems])

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

  const groupQuestionCount = useCallback((groupId: string) => {
    return (itemsByGroup[groupId] ?? []).reduce((sum, item) => sum + (item.question_count ?? 0), 0)
  }, [itemsByGroup])

  const searchLower = catalogSearch.trim().toLowerCase()

  const visibleTree = useMemo(() => {
    if (!searchLower) {
      return groups.map((group) => ({
        group,
        items: itemsByGroup[group.id] ?? [],
        expanded: expandedGroups.has(group.id),
      }))
    }

    return groups
      .map((group) => {
        const items = itemsByGroup[group.id] ?? []
        const groupMatch = group.name.toLowerCase().includes(searchLower)
        const matchedItems = groupMatch
          ? items
          : items.filter((item) => item.name.toLowerCase().includes(searchLower))
        if (!groupMatch && matchedItems.length === 0) return null
        return { group, items: matchedItems, expanded: true }
      })
      .filter(Boolean) as { group: CatalogGroup; items: CatalogItem[]; expanded: boolean }[]
  }, [groups, itemsByGroup, expandedGroups, searchLower])

  const toggleGroup = async (groupId: string) => {
    if (dragQuestionId) return
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(groupId)) next.delete(groupId)
      else next.add(groupId)
      return next
    })
    if (!itemsByGroup[groupId]) await loadItems(groupId)
  }

  const handleCreateGroup = async (name: string) => {
    if (!userId) return
    try {
      await createCatalogGroup(userId, name)
      await loadGroups()
      setDialog({ kind: 'none' })
      showToast('目录组已创建')
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '创建失败')
    }
  }

  const handleCreateItem = async (groupId: string, name: string) => {
    try {
      await createCatalogItem(groupId, name)
      await loadItems(groupId)
      setExpandedGroups((prev) => new Set(prev).add(groupId))
      setDialog({ kind: 'none' })
      showToast('子目录已创建')
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '创建失败')
    }
  }

  const handleRename = async (target: ContextMenuTarget, name: string) => {
    try {
      if (target.kind === 'group') {
        await renameCatalogGroup(target.id, name)
        await loadGroups()
      } else {
        await renameCatalogItem(target.id, name)
        await loadItems(target.groupId)
      }
      setDialog({ kind: 'none' })
      showToast('重命名成功')
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '重命名失败')
    }
  }

  const handleDelete = async (target: ContextMenuTarget) => {
    try {
      if (target.kind === 'group') {
        await deleteCatalogGroup(target.id)
        await loadGroups()
        setItemsByGroup((prev) => {
          const next = { ...prev }
          delete next[target.id]
          return next
        })
        setExpandedGroups((prev) => {
          const next = new Set(prev)
          next.delete(target.id)
          return next
        })
      } else {
        await deleteCatalogItem(target.id)
        await loadItems(target.groupId)
        if (selectedCatalogId === target.id) setSelectedCatalogId(null)
      }
      setDialog({ kind: 'none' })
      showToast('已删除')
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '删除失败')
    }
  }

  const handleDragStart = (questionId: string) => {
    setDragQuestionId(questionId)
    setDropTargetId(null)
    setExpandedGroups(new Set(groups.map((g) => g.id)))
    groups.forEach((g) => {
      if (!itemsByGroup[g.id]) void loadItems(g.id)
    })
  }

  const handleDragEnd = () => {
    setDragQuestionId(null)
    setDropTargetId(null)
  }

  const handleDropOnCatalog = async (catalogId: string, groupId: string) => {
    if (!dragQuestionId) return
    const questionId = dragQuestionId
    setDragQuestionId(null)
    setDropTargetId(null)
    try {
      await addQuestionToCatalog(questionId, catalogId)
      await loadItems(groupId)
      if (selectedCatalogId === catalogId) await loadCatalogFilter(catalogId)
      showToast('归类成功')
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '归类失败')
    }
  }

  const handleSaveEdit = async (updated: BankQuestion) => {
    if (!updated.id || !userId) return
    await updateQuestion(userId, updated.id, updated)
    setEditing(null)
    showToast('保存成功')
    loadQuestions()
  }

  const isDragging = Boolean(dragQuestionId)

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <DashboardHeader title="题库中心" backTo="/teacher/dashboard" backLabel="返回工作台" featureNavRole="teacher" />

      {toast && (
        <div className="pointer-events-none fixed left-1/2 top-20 z-[60] -translate-x-1/2">
          <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-5 py-2.5 text-sm font-medium text-emerald-200 shadow-lg backdrop-blur-sm">
            {toast}
          </div>
        </div>
      )}

      <main className="mx-auto flex h-[calc(100vh-4rem)] max-w-[1400px] gap-0 px-4 py-4">
        {/* 左侧目录树 30% */}
        <aside className="flex w-[30%] min-w-[240px] flex-col rounded-xl border border-slate-700 bg-slate-900/50">
          <div className="space-y-2 border-b border-slate-700 p-3">
            <button
              type="button"
              className={`${btnPrimary} w-full text-sm`}
              onClick={() => setDialog({ kind: 'newGroup' })}
            >
              + 新建目录组
            </button>
            <input
              className={`${inputClass} text-sm py-2`}
              placeholder="搜索目录…"
              value={catalogSearch}
              onChange={(e) => setCatalogSearch(e.target.value)}
            />
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            {visibleTree.length === 0 ? (
              <p className="p-4 text-center text-xs text-slate-500">
                {searchLower ? '无匹配目录' : '暂无目录，点击上方创建'}
              </p>
            ) : visibleTree.map(({ group, items, expanded }) => {
              const groupCount = groupQuestionCount(group.id)
              const groupDisabled = isDragging

              return (
                <div key={group.id} className="mb-1">
                  <div
                    className={`group flex items-center gap-1 rounded-lg px-2 py-2 transition ${
                      groupDisabled
                        ? 'cursor-not-allowed opacity-40'
                        : 'cursor-pointer hover:bg-slate-800/80'
                    }`}
                    onMouseEnter={() => setHoverGroupId(group.id)}
                    onMouseLeave={() => setHoverGroupId(null)}
                    onClick={() => toggleGroup(group.id)}
                    onContextMenu={(e) => {
                      if (groupDisabled) return
                      e.preventDefault()
                      setContextMenu({
                        x: e.clientX,
                        y: e.clientY,
                        target: { kind: 'group', id: group.id, name: group.name },
                      })
                    }}
                  >
                    <span className="text-xs text-slate-500">{expanded ? '▼' : '▶'}</span>
                    <span className="flex-1 truncate text-sm font-medium text-blue-100">
                      {catalogLabel(group.name, groupCount)}
                    </span>
                    {!groupDisabled && (hoverGroupId === group.id || expanded) && (
                      <button
                        type="button"
                        className="shrink-0 rounded px-1.5 text-xs text-slate-400 opacity-0 transition hover:bg-slate-700 hover:text-cyan-300 group-hover:opacity-100"
                        title="新建子目录"
                        onClick={(e) => {
                          e.stopPropagation()
                          setDialog({ kind: 'newItem', groupId: group.id })
                        }}
                      >
                        + 新建子目录
                      </button>
                    )}
                  </div>

                  {expanded && (
                    <div className="ml-4 border-l border-slate-700 pl-2">
                      {items.map((item) => {
                        const isDropTarget = isDragging && dropTargetId === item.id
                        const isSelected = selectedCatalogId === item.id

                        return (
                          <div
                            key={item.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => {
                              if (isDragging) return
                              setSelectedCatalogId(item.id)
                              setPage(1)
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !isDragging) {
                                setSelectedCatalogId(item.id)
                                setPage(1)
                              }
                            }}
                            onDragOver={(e) => {
                              if (!isDragging) return
                              e.preventDefault()
                              e.dataTransfer.dropEffect = 'move'
                              setDropTargetId(item.id)
                            }}
                            onDragLeave={(e) => {
                              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                                setDropTargetId((prev) => (prev === item.id ? null : prev))
                              }
                            }}
                            onDrop={(e) => {
                              e.preventDefault()
                              void handleDropOnCatalog(item.id, group.id)
                            }}
                            onContextMenu={(e) => {
                              if (isDragging) return
                              e.preventDefault()
                              setContextMenu({
                                x: e.clientX,
                                y: e.clientY,
                                target: { kind: 'item', id: item.id, name: item.name, groupId: group.id },
                              })
                            }}
                            className={`mb-0.5 rounded-lg px-2 py-1.5 text-sm transition ${
                              isDropTarget
                                ? 'border border-emerald-400/60 bg-emerald-500/25 text-emerald-100 ring-2 ring-emerald-400/40'
                                : isSelected
                                  ? 'bg-cyan-500/15 text-cyan-200'
                                  : isDragging
                                    ? 'border border-dashed border-slate-600 text-slate-300 hover:border-emerald-500/50 hover:bg-emerald-500/10'
                                    : 'text-slate-300 hover:bg-slate-800/60'
                            }`}
                          >
                            <span className="truncate">📁 {catalogLabel(item.name, item.question_count ?? 0)}</span>
                          </div>
                        )
                      })}
                      {items.length === 0 && (
                        <p className="py-2 text-xs text-slate-600">暂无子目录</p>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {isDragging && (
            <div className="border-t border-slate-700 px-3 py-2 text-xs text-emerald-300/90">
              拖拽题目到二级目录完成归类
            </div>
          )}
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
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
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
          <button
            type="button"
            className="block w-full px-4 py-2 text-left text-sm hover:bg-slate-800"
            onClick={() => {
              setDialog({ kind: 'rename', target: contextMenu.target })
              setContextMenu(null)
            }}
          >
            重命名
          </button>
          <button
            type="button"
            className="block w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-slate-800"
            onClick={() => {
              setDialog({ kind: 'delete', target: contextMenu.target })
              setContextMenu(null)
            }}
          >
            删除
          </button>
        </div>
      )}

      <CatalogInputDialog
        open={dialog.kind === 'newGroup'}
        title="新建目录组"
        label="目录组名称"
        placeholder="如：高一数学"
        onConfirm={handleCreateGroup}
        onCancel={() => setDialog({ kind: 'none' })}
      />

      <CatalogInputDialog
        open={dialog.kind === 'newItem'}
        title="新建子目录"
        label="子目录名称"
        placeholder="如：函数专题"
        onConfirm={(name) => dialog.kind === 'newItem' && handleCreateItem(dialog.groupId, name)}
        onCancel={() => setDialog({ kind: 'none' })}
      />

      <CatalogInputDialog
        open={dialog.kind === 'rename'}
        title="重命名"
        label="新名称"
        defaultValue={dialog.kind === 'rename' ? dialog.target.name : ''}
        onConfirm={(name) => dialog.kind === 'rename' && handleRename(dialog.target, name)}
        onCancel={() => setDialog({ kind: 'none' })}
      />

      <CatalogConfirmDialog
        open={dialog.kind === 'delete'}
        title="确认删除"
        label={
          dialog.kind === 'delete'
            ? `确定删除「${dialog.target.name}」？此操作不可撤销。`
            : ''
        }
        confirmLabel="删除"
        onConfirm={() => dialog.kind === 'delete' && void handleDelete(dialog.target)}
        onCancel={() => setDialog({ kind: 'none' })}
      />

      {editing && (
        <QuestionEditModal
          question={editing}
          teacherId={userId}
          onSave={handleSaveEdit}
          onCancel={() => setEditing(null)}
        />
      )}

      <QuestionBasket />
    </div>
  )
}
