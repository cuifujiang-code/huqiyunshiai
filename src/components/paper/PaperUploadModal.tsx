import { useEffect, useMemo, useState } from 'react'
import type { PaperCategory } from '../../types/paper'
import {
  filterCategoriesByGrade,
  isGaokaoCategory,
  isJuniorGrade,
  PAPER_GRADES,
  PAPER_LEVELS,
  PAPER_SUBJECTS,
  PAPER_TERMS,
} from '../../types/paper'
import { uploadPaper, uploadPapersBatch } from '../../lib/paperApi'
import { buildUploadPayloadFromFile, categoryNameById, inferMajorityCategoryId, parsePaperFilename } from '../../lib/paperFilenameParser'

const MAX_BATCH = 30

interface Props {
  open: boolean
  userId: string
  categories: PaperCategory[]
  defaultSubject?: string
  onClose: () => void
  onSuccess: () => void
}

type UploadMode = 'single' | 'batch'

type BatchStatus = 'pending' | 'uploading' | 'done' | 'error'

interface BatchRow {
  file: File
  title: string
  grade: string
  category_id?: string
  categoryName?: string
  status: BatchStatus
  error?: string
}

const SHARED_DEFAULT = {
  subject: '数学',
  grade: '高一',
  term: '无',
  exam_year: new Date().getFullYear(),
  area: '全国',
  category_id: '',
  level: '普通',
  has_answer: false,
  has_analysis: false,
  set_type: 'single' as const,
}

export default function PaperUploadModal({
  open,
  userId,
  categories,
  defaultSubject = '数学',
  onClose,
  onSuccess,
}: Props) {
  const [mode, setMode] = useState<UploadMode>('single')
  const [file, setFile] = useState<File | null>(null)
  const [batchFiles, setBatchFiles] = useState<BatchRow[]>([])
  const [progress, setProgress] = useState(0)
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [parseHint, setParseHint] = useState('')
  const [form, setForm] = useState({ ...SHARED_DEFAULT, subject: defaultSubject, title: '' })

  useEffect(() => {
    if (open) {
      setForm((f) => ({ ...f, subject: defaultSubject, title: '' }))
      setMode('single')
    } else {
      setFile(null)
      setBatchFiles([])
      setProgress(0)
      setBatchProgress({ current: 0, total: 0 })
      setError('')
      setParseHint('')
    }
  }, [open, defaultSubject])

  const allFlatCategories = useMemo(
    () => categories.flatMap((c) => [c, ...(c.children ?? [])]),
    [categories],
  )

  const uploadCategories = useMemo(
    () => filterCategoriesByGrade(categories, form.grade),
    [categories, form.grade],
  )

  const flatCategories = uploadCategories.flatMap((c) => [c, ...(c.children ?? [])])

  const batchMissingCategoryCount = useMemo(
    () => batchFiles.filter((r) => !r.category_id).length,
    [batchFiles],
  )

  function applyDefaultCategoryToMissing(categoryId: string) {
    if (!categoryId) return
    const name = categoryNameById(categoryId, allFlatCategories)
    setBatchFiles((prev) =>
      prev.map((r) =>
        r.category_id
          ? r
          : { ...r, category_id: categoryId, categoryName: name },
      ),
    )
  }

  function handleDefaultCategoryChange(categoryId: string) {
    setForm((f) => ({ ...f, category_id: categoryId }))
    applyDefaultCategoryToMissing(categoryId)
    if (categoryId && batchMissingCategoryCount > 0) {
      setError('')
    }
  }

  function updateBatchRowCategory(index: number, categoryId: string) {
    const name = categoryNameById(categoryId, allFlatCategories)
    setBatchFiles((prev) =>
      prev.map((r, i) =>
        i === index ? { ...r, category_id: categoryId || undefined, categoryName: name } : r,
      ),
    )
  }

  useEffect(() => {
    if (isJuniorGrade(form.grade) && isGaokaoCategory(categories, form.category_id)) {
      setForm((f) => ({ ...f, category_id: '' }))
    }
  }, [form.grade, form.category_id, categories])

  function handleFileSelect(selected: File | null) {
    setFile(selected)
    if (!selected) {
      setParseHint('')
      return
    }
    const parsed = parsePaperFilename(selected.name, allFlatCategories)
    if (parsed.hasAnyMatch) {
      setParseHint('已自动识别文件名信息，可手动修改补充')
      setForm((prev) => ({
        ...prev,
        ...(parsed.title ? { title: parsed.title } : {}),
        ...(parsed.area ? { area: parsed.area } : {}),
        ...(parsed.exam_year ? { exam_year: parsed.exam_year } : {}),
        ...(parsed.grade ? { grade: parsed.grade } : {}),
        ...(parsed.term ? { term: parsed.term } : {}),
        ...(parsed.category_id ? { category_id: parsed.category_id } : {}),
        ...(parsed.has_answer ? { has_answer: true } : {}),
        ...(parsed.has_analysis ? { has_analysis: true } : {}),
      }))
    } else {
      setParseHint('未识别到试卷信息，请手动填写表单')
    }
  }

  function handleBatchFileSelect(list: FileList | null) {
    if (!list?.length) {
      setBatchFiles([])
      return
    }
    const files = Array.from(list).slice(0, MAX_BATCH)
    if (list.length > MAX_BATCH) {
      setError(`单次最多上传 ${MAX_BATCH} 份，已截取前 ${MAX_BATCH} 个文件`)
    } else {
      setError('')
    }
    const rows: BatchRow[] = files.map((f) => {
      const parsed = parsePaperFilename(f.name, allFlatCategories)
      return {
        file: f,
        title: parsed.title || f.name.replace(/\.[^.]+$/, ''),
        grade: parsed.grade || form.grade,
        category_id: parsed.category_id,
        categoryName: parsed.categoryName,
        status: 'pending' as const,
      }
    })

    const majorityId = inferMajorityCategoryId(rows)
    const filled = majorityId
      ? rows.map((r) =>
          r.category_id
            ? r
            : {
                ...r,
                category_id: majorityId,
                categoryName: categoryNameById(majorityId, allFlatCategories),
              },
        )
      : rows

    const missing = filled.filter((r) => !r.category_id).length
    const recognized = filled.length - missing

    setBatchFiles(filled)
    if (majorityId) {
      setForm((f) => ({ ...f, category_id: majorityId }))
    }

    if (missing === 0) {
      setParseHint(`已选择 ${filled.length} 份试卷，全部分类已识别`)
    } else if (majorityId && missing < filled.length) {
      setParseHint(
        `已选择 ${filled.length} 份：${recognized} 份已识别分类，${missing} 份未识别（请选择下方默认分类自动补全）`,
      )
    } else {
      setParseHint(
        `已选择 ${filled.length} 份试卷，${missing} 份未识别分类，请选择下方「默认归属分类」`,
      )
    }
  }

  if (!open) return null

  async function handleSubmitSingle(e: React.FormEvent) {
    e.preventDefault()
    if (!file) {
      setError('请选择试卷文件')
      return
    }
    if (!form.title.trim()) {
      setError('请填写试卷标题')
      return
    }
    if (!form.subject) {
      setError('请选择学科')
      return
    }
    if (!form.category_id) {
      setError('请选择归属分类')
      return
    }
    setLoading(true)
    setError('')
    try {
      await uploadPaper(userId, { ...form, category_id: form.category_id || null }, file, setProgress)
      onSuccess()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : '上传失败')
    } finally {
      setLoading(false)
    }
  }

  async function handleSubmitBatch(e: React.FormEvent) {
    e.preventDefault()
    if (!batchFiles.length) {
      setError('请选择要上传的试卷文件')
      return
    }
    if (!form.subject) {
      setError('请选择学科')
      return
    }
    setLoading(true)
    setError('')
    setBatchProgress({ current: 0, total: batchFiles.length })

    const items = batchFiles.map((row) => ({
      file: row.file,
      payload: buildUploadPayloadFromFile(
        row.file,
        allFlatCategories,
        {
          subject: form.subject,
          level: form.level,
          category_id: form.category_id || undefined,
          grade: form.grade,
          term: form.term,
          exam_year: form.exam_year,
          area: form.area,
        },
        { category_id: row.category_id },
      ),
    }))

    const missingCat = batchFiles.filter((r) => !r.category_id)
    if (missingCat.length > 0) {
      setError(`${missingCat.length} 份仍无归属分类，请在列表中逐份选择或设置默认分类`)
      setLoading(false)
      return
    }

    const result = await uploadPapersBatch(userId, items, {
      onFileStart: (i) => {
        setBatchProgress({ current: i + 1, total: batchFiles.length })
        setBatchFiles((prev) => prev.map((r, idx) => (idx === i ? { ...r, status: 'uploading', error: undefined } : r)))
      },
      onFileDone: (i, ok, message) => {
        setBatchFiles((prev) =>
          prev.map((r, idx) =>
            idx === i ? { ...r, status: ok ? 'done' : 'error', error: message } : r,
          ),
        )
      },
    })

    setLoading(false)
    if (result.failed === 0) {
      onSuccess()
      onClose()
    } else if (result.success > 0) {
      setError(`完成 ${result.success} 份，失败 ${result.failed} 份，请查看列表后重试失败项`)
      onSuccess()
    } else {
      setError(`全部上传失败（${result.failed} 份）`)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className={`max-h-[90vh] w-full overflow-y-auto rounded-[12px] border border-white/[0.08] bg-[#1a2030] p-6 shadow-xl ${mode === 'batch' ? 'max-w-2xl' : 'max-w-lg'}`}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-[#E8ECF3]">上传试卷</h2>
          <div className="flex rounded-[8px] border border-white/[0.08] p-0.5 text-xs">
            <button
              type="button"
              className={`rounded-[6px] px-3 py-1 ${mode === 'single' ? 'bg-[#2584FF] text-white' : 'text-[#8A94A9]'}`}
              onClick={() => { setMode('single'); setError(''); setParseHint('') }}
              disabled={loading}
            >
              单个上传
            </button>
            <button
              type="button"
              className={`rounded-[6px] px-3 py-1 ${mode === 'batch' ? 'bg-[#2584FF] text-white' : 'text-[#8A94A9]'}`}
              onClick={() => { setMode('batch'); setError(''); setFile(null); setParseHint('') }}
              disabled={loading}
            >
              批量上传
            </button>
          </div>
        </div>

        {parseHint && (
          <p className={`mb-3 rounded-[8px] px-3 py-2 text-xs ${parseHint.includes('未识别') ? 'bg-amber-500/10 text-amber-200/90' : 'bg-white/[0.04] text-[#8A94A9]'}`}>
            {parseHint}
          </p>
        )}

        {mode === 'single' ? (
          <form onSubmit={handleSubmitSingle} className="space-y-3 text-sm">
            <label className="block">
              <span className="text-[#8A94A9]">文件 *（PDF/Word/Excel/图片/zip，最大50MB）</span>
              <input type="file" className="mt-1 w-full text-xs text-[#C8CFDF]" accept=".pdf,.doc,.docx,.xls,.xlsx,.zip,.rar,.png,.jpg,.jpeg,.gif,.webp" onChange={(e) => handleFileSelect(e.target.files?.[0] ?? null)} />
            </label>
            <SingleFormFields form={form} setForm={setForm} flatCategories={flatCategories} />
            {loading && progress > 0 && <ProgressBar percent={progress} />}
            {error && <p className="text-xs text-red-400">{error}</p>}
            <FormActions loading={loading} onClose={onClose} label="提交" />
          </form>
        ) : (
          <form onSubmit={handleSubmitBatch} className="space-y-3 text-sm">
            <label className="block">
              <span className="text-[#8A94A9]">选择多个文件 *（最多 {MAX_BATCH} 份，单文件最大50MB）</span>
              <input
                type="file"
                multiple
                className="mt-1 w-full text-xs text-[#C8CFDF]"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.zip,.rar,.png,.jpg,.jpeg,.gif,.webp"
                onChange={(e) => handleBatchFileSelect(e.target.files)}
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-[#8A94A9]">统一学科 *</span>
                <select className="mt-1 w-full rounded border border-white/[0.08] bg-[#121722] px-2 py-2 text-[#E8ECF3]" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} required>
                  {PAPER_SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-[#8A94A9]">统一等级</span>
                <select className="mt-1 w-full rounded border border-white/[0.08] bg-[#121722] px-2 py-2 text-[#E8ECF3]" value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })}>
                  {PAPER_LEVELS.filter((l) => l !== '不限').map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </label>
            </div>
            {batchMissingCategoryCount > 0 && batchFiles.length > 0 && (
              <p className="rounded-[8px] border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200/90">
                还有 {batchMissingCategoryCount} 份未识别分类，选择下方默认分类将自动补全，或在列表中逐份修改
              </p>
            )}
            <label className="block">
              <span className="text-[#8A94A9]">
                默认归属分类
                {batchMissingCategoryCount > 0 && <span className="text-amber-300 ml-1">* 未识别文件将使用此分类</span>}
              </span>
              <select
                className="mt-1 w-full rounded border border-white/[0.08] bg-[#121722] px-2 py-2 text-[#E8ECF3]"
                value={form.category_id}
                onChange={(e) => handleDefaultCategoryChange(e.target.value)}
              >
                <option value="">请选择默认分类</option>
                {allFlatCategories.map((c) => (
                  <option key={c.id} value={c.id}>{c.category_name}</option>
                ))}
              </select>
            </label>
            {batchFiles.length > 0 && (
              <div className="max-h-56 overflow-y-auto rounded border border-white/[0.06] bg-[#121722]">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-[#161c28] text-[#8A94A9]">
                    <tr>
                      <th className="px-2 py-1.5 text-left font-normal">文件名</th>
                      <th className="px-2 py-1.5 text-left font-normal">识别标题</th>
                      <th className="px-2 py-1.5 text-left font-normal">年级</th>
                      <th className="px-2 py-1.5 text-left font-normal min-w-[100px]">分类</th>
                      <th className="px-2 py-1.5 text-left font-normal">状态</th>
                    </tr>
                  </thead>
                  <tbody className="text-[#C8CFDF]">
                    {batchFiles.map((row, i) => (
                      <tr
                        key={`${row.file.name}-${i}`}
                        className={`border-t border-white/[0.04] ${!row.category_id ? 'bg-amber-500/[0.06]' : ''}`}
                      >
                        <td className="px-2 py-1.5 max-w-[100px] truncate" title={row.file.name}>{row.file.name}</td>
                        <td className="px-2 py-1.5 max-w-[120px] truncate" title={row.title}>{row.title}</td>
                        <td className="px-2 py-1.5 whitespace-nowrap">{row.grade}</td>
                        <td className="px-2 py-1.5">
                          <select
                            className={`w-full max-w-[110px] rounded border bg-[#1C2332] px-1 py-0.5 text-[11px] ${!row.category_id ? 'border-amber-500/40 text-amber-200' : 'border-white/[0.08] text-[#E8ECF3]'}`}
                            value={row.category_id ?? ''}
                            onChange={(e) => updateBatchRowCategory(i, e.target.value)}
                          >
                            <option value="">未识别</option>
                            {allFlatCategories.map((c) => (
                              <option key={c.id} value={c.id}>{c.category_name}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-2 py-1.5 whitespace-nowrap">
                          {row.status === 'pending' && <span className="text-[#8A94A9]">待上传</span>}
                          {row.status === 'uploading' && <span className="text-[#5C9DFF]">上传中</span>}
                          {row.status === 'done' && <span className="text-emerald-400">成功</span>}
                          {row.status === 'error' && <span className="text-red-400" title={row.error}>失败</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {loading && batchProgress.total > 0 && (
              <p className="text-xs text-[#8A94A9]">
                正在上传 {batchProgress.current} / {batchProgress.total}
              </p>
            )}
            {error && <p className="text-xs text-red-400">{error}</p>}
            <FormActions loading={loading} onClose={onClose} label={`批量提交${batchFiles.length ? `（${batchFiles.length} 份）` : ''}`} />
          </form>
        )}
      </div>
    </div>
  )
}

function ProgressBar({ percent }: { percent: number }) {
  return (
    <div className="h-1.5 rounded bg-white/[0.06] overflow-hidden">
      <div className="h-full bg-[#2584FF] transition-all" style={{ width: `${percent}%` }} />
    </div>
  )
}

function FormActions({ loading, onClose, label }: { loading: boolean; onClose: () => void; label: string }) {
  return (
    <div className="flex justify-end gap-2 pt-2">
      <button type="button" className="rounded px-4 py-2 text-sm text-[#8A94A9] hover:text-[#E8ECF3]" onClick={onClose} disabled={loading}>取消</button>
      <button type="submit" className="rounded bg-[#2584FF] px-4 py-2 text-sm font-medium text-white hover:bg-[#1a6fe0] disabled:opacity-50" disabled={loading}>
        {loading ? '上传中…' : label}
      </button>
    </div>
  )
}

function SingleFormFields({
  form,
  setForm,
  flatCategories,
}: {
  form: typeof SHARED_DEFAULT & { title?: string }
  setForm: React.Dispatch<React.SetStateAction<typeof SHARED_DEFAULT & { title?: string }>>
  flatCategories: PaperCategory[]
}) {
  return (
    <>
      <label className="block">
        <span className="text-[#8A94A9]">试卷标题 *</span>
        <input className="mt-1 w-full rounded border border-white/[0.08] bg-[#121722] px-3 py-2 text-[#E8ECF3]" value={form.title ?? ''} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-[#8A94A9]">学科 *</span>
          <select className="mt-1 w-full rounded border border-white/[0.08] bg-[#121722] px-2 py-2 text-[#E8ECF3]" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} required>
            {PAPER_SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-[#8A94A9]">年级 *</span>
          <select className="mt-1 w-full rounded border border-white/[0.08] bg-[#121722] px-2 py-2 text-[#E8ECF3]" value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value })} required>
            {PAPER_GRADES.filter((g) => g !== '不限').map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </label>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-[#8A94A9]">学期</span>
          <select className="mt-1 w-full rounded border border-white/[0.08] bg-[#121722] px-2 py-2 text-[#E8ECF3]" value={form.term} onChange={(e) => setForm({ ...form, term: e.target.value })}>
            {PAPER_TERMS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-[#8A94A9]">年份</span>
          <input type="number" className="mt-1 w-full rounded border border-white/[0.08] bg-[#121722] px-2 py-2 text-[#E8ECF3]" value={form.exam_year} onChange={(e) => setForm({ ...form, exam_year: Number(e.target.value) })} />
        </label>
      </div>
      <label className="block">
        <span className="text-[#8A94A9]">地区</span>
        <input className="mt-1 w-full rounded border border-white/[0.08] bg-[#121722] px-2 py-2 text-[#E8ECF3]" value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} placeholder="全国 / 浙江 等" />
      </label>
      <label className="block">
        <span className="text-[#8A94A9]">归属分类 *</span>
        <select className="mt-1 w-full rounded border border-white/[0.08] bg-[#121722] px-2 py-2 text-[#E8ECF3]" value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })} required>
          <option value="">请选择</option>
          {flatCategories.map((c) => (
            <option key={c.id} value={c.id}>{c.category_name}</option>
          ))}
        </select>
        {isJuniorGrade(form.grade) && (
          <p className="mt-1 text-[10px] text-[#6B7280]">初中年级不含「高考复习」分类</p>
        )}
      </label>
      <label className="block">
        <span className="text-[#8A94A9]">等级</span>
        <select className="mt-1 w-full rounded border border-white/[0.08] bg-[#121722] px-2 py-2 text-[#E8ECF3]" value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })}>
          {PAPER_LEVELS.filter((l) => l !== '不限').map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
      </label>
      <div className="flex gap-4">
        <label className="flex items-center gap-2 text-[#8A94A9]">
          <input type="checkbox" checked={form.has_answer} onChange={(e) => setForm({ ...form, has_answer: e.target.checked })} className="accent-[#2584FF]" />
          含答案
        </label>
        <label className="flex items-center gap-2 text-[#8A94A9]">
          <input type="checkbox" checked={form.has_analysis} onChange={(e) => setForm({ ...form, has_analysis: e.target.checked })} className="accent-[#2584FF]" />
          含解析
        </label>
      </div>
    </>
  )
}
