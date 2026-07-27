import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import DashboardHeader from '../components/layout/DashboardHeader'
import PaperCategorySidebar from '../components/paper/PaperCategorySidebar'
import PaperFilterBar from '../components/paper/PaperFilterBar'
import PaperCard from '../components/paper/PaperCard'
import PaperUploadModal from '../components/paper/PaperUploadModal'
import PaperPreviewModal from '../components/paper/PaperPreviewModal'
import PaperBasketModal from '../components/paper/PaperBasketModal'
import {
  defaultPaperFilters,
  filterCategoriesByGrade,
  isGaokaoCategory,
  isJuniorGrade,
  PAPER_SORT_TABS,
  type PaperCategory,
  type PaperFilters,
  type PaperItem,
} from '../types/paper'
import {
  deletePaper,
  downloadPaper,
  fetchPaperCategories,
  fetchPaperCollection,
  fetchPaperDetail,
  fetchPapers,
  togglePaperCollect,
} from '../lib/paperApi'

interface Props {
  mode: 'teacher' | 'student'
}

export default function PaperResourcePage({ mode }: Props) {
  const { profile } = useAuth()
  const userId = profile?.id ?? ''
  const isTeacher = mode === 'teacher'

  const [categories, setCategories] = useState<PaperCategory[]>([])
  const [filters, setFilters] = useState<PaperFilters>(defaultPaperFilters())
  const [selectedCategoryId, setSelectedCategoryId] = useState('')
  const [selectedCategoryName, setSelectedCategoryName] = useState('全部')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [sortTab, setSortTab] = useState('latest')
  const [viewMode, setViewMode] = useState<'single' | 'set' | ''>('')
  const [page, setPage] = useState(1)
  const [items, setItems] = useState<PaperItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [previewPaper, setPreviewPaper] = useState<PaperItem | null>(null)
  const [basketOpen, setBasketOpen] = useState(false)
  const [basket, setBasket] = useState<PaperItem[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)

  const pageSize = 10
  const pageCount = Math.max(1, Math.ceil(total / pageSize))

  const selectedSubject = filters.subject === '不限' ? '' : filters.subject
  const visibleCategories = useMemo(
    () => filterCategoriesByGrade(categories, filters.grade),
    [categories, filters.grade],
  )

  const loadCategories = useCallback(async () => {
    try {
      const cats = await fetchPaperCategories(filters.grade)
      setCategories(cats)
    } catch {
      /* 未配置 Supabase 时静默 */
    }
  }, [filters.grade])

  const loadBasket = useCallback(async () => {
    if (!userId) return
    try {
      const list = await fetchPaperCollection(userId)
      setBasket(list)
    } catch {
      setBasket([])
    }
  }, [userId])

  const loadPapers = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    try {
      const result = await fetchPapers(userId, {
        ...filters,
        category_id: selectedCategoryId,
        set_type: viewMode,
        sort: sortTab,
        page,
        pageSize,
        my_uploads: isTeacher && filters.my_uploads,
      })
      setItems(result.items)
      setTotal(result.total)
    } catch {
      setItems([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [userId, filters, selectedCategoryId, viewMode, sortTab, page, isTeacher])

  useEffect(() => {
    loadCategories()
    loadBasket()
  }, [loadCategories, loadBasket])

  useEffect(() => {
    const t = setTimeout(loadPapers, 200)
    return () => clearTimeout(t)
  }, [loadPapers])

  useEffect(() => {
    if (isJuniorGrade(filters.grade) && isGaokaoCategory(categories, selectedCategoryId)) {
      setSelectedCategoryId('')
      setSelectedCategoryName('全部')
      setPage(1)
    }
  }, [filters.grade, categories, selectedCategoryId])

  const handleFilterChange = (patch: Partial<PaperFilters>) => {
    setFilters((f) => ({ ...f, ...patch }))
    setPage(1)
  }

  const handleSubjectSelect = (subject: string) => {
    handleFilterChange({ subject: subject || '不限' })
  }

  const handleCategorySelect = (id: string, name: string) => {
    setSelectedCategoryId(id)
    setSelectedCategoryName(name)
    setPage(1)
  }

  const handlePreview = async (p: PaperItem) => {
    try {
      const detail = await fetchPaperDetail(userId, p.id)
      setPreviewPaper(detail)
    } catch {
      setPreviewPaper(p)
    }
  }

  const handleDownload = async (p: PaperItem) => {
    try {
      const { url, fileName } = await downloadPaper(userId, p.id)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName || p.title
      a.target = '_blank'
      a.rel = 'noopener'
      a.click()
    } catch {
      window.open(p.file_url, '_blank')
    }
  }

  const handleCollect = async (p: PaperItem) => {
    const collect = !p.collected
    await togglePaperCollect(userId, p.id, collect)
    setItems((prev) => prev.map((x) => (x.id === p.id ? { ...x, collected: collect } : x)))
    loadBasket()
  }

  const handleDelete = async (p: PaperItem) => {
    if (!confirm('确定删除此试卷？')) return
    await deletePaper(userId, p.id)
    loadPapers()
  }

  const title = useMemo(() => (isTeacher ? '试题试卷' : '试卷资源'), [isTeacher])
  const backTo = isTeacher ? '/teacher/dashboard' : '/student/dashboard'
  const breadcrumb = useMemo(() => {
    const parts = []
    if (selectedSubject) parts.push(selectedSubject)
    parts.push(selectedCategoryName)
    return parts.join(' · ')
  }, [selectedSubject, selectedCategoryName])

  return (
    <div className="min-h-screen text-[#E8ECF3]" style={{ backgroundColor: '#121722' }}>
      <DashboardHeader title={title} backTo={backTo} backLabel="返回" featureNavRole={mode} />

      <div className="flex" style={{ height: 'calc(100vh - 56px)' }}>
        <PaperCategorySidebar
          categories={visibleCategories}
          selectedSubject={selectedSubject}
          selectedCategoryId={selectedCategoryId}
          onSubjectSelect={handleSubjectSelect}
          onCategorySelect={handleCategorySelect}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
        />

        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto" ref={scrollRef}>
            <PaperFilterBar
              filters={filters}
              onChange={handleFilterChange}
              isTeacher={isTeacher}
              syncHref={`/${mode}/paper-resources?sync=1`}
              onUpload={isTeacher ? () => setUploadOpen(true) : undefined}
              onOpenBasket={() => setBasketOpen(true)}
              basketCount={basket.length}
            />

            <div className="border-b border-white/[0.04] px-5 py-2 flex flex-wrap items-center gap-3 bg-[#121722]">
              <span className="text-xs text-[#8A94A9]">{breadcrumb}</span>
              <div className="flex gap-1">
                {PAPER_SORT_TABS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={`rounded-full px-3 py-1 text-xs ${sortTab === t.id ? 'bg-[#2584FF]/20 text-[#5C9DFF]' : 'text-[#8A94A9] hover:text-[#E8ECF3]'}`}
                    onClick={() => { setSortTab(t.id); setPage(1) }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <div className="flex gap-1 ml-auto">
                <button type="button" className={`text-xs px-2 py-1 rounded ${viewMode === 'single' ? 'text-[#5C9DFF]' : 'text-[#8A94A9]'}`} onClick={() => setViewMode('single')}>单份</button>
                <button type="button" className={`text-xs px-2 py-1 rounded ${viewMode === 'set' ? 'text-[#5C9DFF]' : 'text-[#8A94A9]'}`} onClick={() => setViewMode('set')}>成套</button>
                <button type="button" className={`text-xs px-2 py-1 rounded ${viewMode === '' ? 'text-[#5C9DFF]' : 'text-[#8A94A9]'}`} onClick={() => setViewMode('')}>全部</button>
              </div>
              {isTeacher && (
                <button
                  type="button"
                  className={`text-xs ${filters.my_uploads ? 'text-[#5C9DFF]' : 'text-[#8A94A9]'}`}
                  onClick={() => handleFilterChange({ my_uploads: !filters.my_uploads })}
                >
                  我的上传
                </button>
              )}
            </div>

            <div className="px-5 py-4 space-y-3">
              {loading ? (
                <div className="py-16 text-center text-[#8A94A9]">加载中…</div>
              ) : items.length === 0 ? (
                <div className="py-16 text-center text-[#8A94A9]">暂无试卷资源</div>
              ) : (
                items.map((p) => (
                  <PaperCard
                    key={p.id}
                    paper={p}
                    isTeacher={isTeacher}
                    onPreview={() => handlePreview(p)}
                    onDownload={() => handleDownload(p)}
                    onCollect={() => handleCollect(p)}
                    onDelete={isTeacher ? () => handleDelete(p) : undefined}
                  />
                ))
              )}
            </div>
          </div>

          <div className="shrink-0 flex items-center justify-between border-t border-white/[0.04] px-5 py-3 text-sm text-[#8A94A9]">
            <span>共 {total} 份</span>
            <div className="flex items-center gap-3">
              <button type="button" disabled={page <= 1} className="rounded border border-white/[0.08] px-3 py-1 text-xs disabled:opacity-30" onClick={() => setPage((p) => p - 1)}>上一页</button>
              <span>{page} / {pageCount}</span>
              <button type="button" disabled={page >= pageCount} className="rounded border border-white/[0.08] px-3 py-1 text-xs disabled:opacity-30" onClick={() => setPage((p) => p + 1)}>下一页</button>
            </div>
          </div>
        </div>
      </div>

      {isTeacher && (
        <PaperUploadModal
          open={uploadOpen}
          userId={userId}
          categories={visibleCategories}
          defaultSubject={selectedSubject || '数学'}
          onClose={() => setUploadOpen(false)}
          onSuccess={loadPapers}
        />
      )}

      <PaperPreviewModal
        paper={previewPaper}
        onClose={() => setPreviewPaper(null)}
        onDownload={() => previewPaper && handleDownload(previewPaper)}
      />

      <PaperBasketModal
        open={basketOpen}
        items={basket}
        onClose={() => setBasketOpen(false)}
        onRemove={async (id) => {
          await togglePaperCollect(userId, id, false)
          loadBasket()
          loadPapers()
        }}
        onDownloadAll={() => {
          basket.forEach((p) => handleDownload(p))
        }}
      />
    </div>
  )
}
