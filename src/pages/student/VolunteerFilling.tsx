import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import DashboardHeader from '../../components/layout/DashboardHeader'
import ComplianceAlert from '../../components/volunteer/ComplianceAlert'
import LegacyVolunteerResultsTable from '../../components/volunteer/LegacyVolunteerResultsTable'
import ScoreRankLinkedInput from '../../components/volunteer/ScoreRankLinkedInput'
import VolunteerResultsPanel from '../../components/volunteer/VolunteerResultsPanel'
import ZhejiangRulesModal from '../../components/volunteer/ZhejiangRulesModal'
import { useAuth } from '../../context/AuthContext'
import { GAOBAO_PROVINCE_NAMES } from '../../data/gaokaoProvinces2025'
import { ZHEJIANG_ELECTIVE_SUBJECTS } from '../../data/provinceExamProfiles'
import {
  EXAM_YEAR_OPTIONS,
  ZHEJIANG_BATCH_SEGMENTS,
  ZHEJIANG_ELECTIVE_COUNT,
  DEFAULT_TIER_GUIDE,
} from '../../data/zhejiangVolunteer'
import {
  exportVolunteerSchemeExcel,
  exportVolunteerSchemePdf,
} from '../../lib/volunteerExport'
import {
  fetchVolunteerScheme,
  fetchVolunteerSchemes,
  generateVolunteerScheme,
  updateVolunteerScheme,
  validateZhejiangInput,
} from '../../lib/volunteerApi'
import type {
  ComplianceIssue,
  TierStrategySummary,
  VolunteerFormInput,
  VolunteerItem,
  VolunteerSchemeSummary,
  VolunteerTierLabel,
} from '../../types/volunteer'

const SUBJECT_TYPES = ['物理类', '历史类', '综合'] as const
const ELECTIVE_OPTIONS = ['物理', '化学', '生物', '历史', '政治', '地理', '技术']

function buildTierStrategyFromItems(items: VolunteerItem[]): TierStrategySummary {
  const byTier: Record<VolunteerTierLabel, VolunteerItem[]> = { 冲: [], 稳: [], 保: [] }
  for (const item of items) byTier[item.tierLabel]?.push(item)
  const avgProb = (list: VolunteerItem[]) => {
    if (!list.length) return null
    return list.reduce((a, i) => a + (i.probability ?? 0), 0) / list.length
  }
  return {
    冲: { count: byTier.冲.length, guide: DEFAULT_TIER_GUIDE.冲, avgProbability: avgProb(byTier.冲) },
    稳: { count: byTier.稳.length, guide: DEFAULT_TIER_GUIDE.稳, avgProbability: avgProb(byTier.稳) },
    保: { count: byTier.保.length, guide: DEFAULT_TIER_GUIDE.保, avgProbability: avgProb(byTier.保) },
  }
}

function defaultForm(): VolunteerFormInput {
  return {
    province: '浙江',
    subjectType: '物理类',
    subjects: ['物理', '化学', '生物'],
    score: undefined,
    rank: 30000,
    intendedMajors: ['计算机'],
    batchType: '本科',
    examYear: 2025,
    batchSegment: '一段',
  }
}

function isZhejiang(province: string) {
  return province.trim() === '浙江'
}

export default function VolunteerFilling() {
  const { profile } = useAuth()
  const userId = profile?.id ?? profile?.phone ?? ''

  const [form, setForm] = useState<VolunteerFormInput>(defaultForm)
  const [items, setItems] = useState<VolunteerItem[]>([])
  const [schemeId, setSchemeId] = useState<string | null>(null)
  const [schemeName, setSchemeName] = useState('')
  const [history, setHistory] = useState<VolunteerSchemeSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  const [tierStrategy, setTierStrategy] = useState<TierStrategySummary | null>(null)
  const [view, setView] = useState<'form' | 'history'>('form')
  const [rulesOpen, setRulesOpen] = useState(false)
  const [complianceIssues, setComplianceIssues] = useState<ComplianceIssue[]>([])
  const [exporting, setExporting] = useState<'pdf' | 'excel' | null>(null)
  const resultsRef = useRef<HTMLElement | null>(null)

  const zjMode = isZhejiang(form.province)
  const electiveOptions = zjMode ? [...ZHEJIANG_ELECTIVE_SUBJECTS] : ELECTIVE_OPTIONS
  const subjectTypes = zjMode ? (['物理类', '历史类'] as const) : SUBJECT_TYPES

  const grouped = useMemo(() => {
    const g: Record<VolunteerTierLabel, VolunteerItem[]> = { 冲: [], 稳: [], 保: [] }
    for (const item of items) g[item.tierLabel]?.push(item)
    return g
  }, [items])

  const loadHistory = useCallback(async () => {
    if (!userId) return
    const res = await fetchVolunteerSchemes(userId)
    if (res.success && res.schemes) setHistory(res.schemes)
  }, [userId])

  useEffect(() => { loadHistory().catch(() => {}) }, [loadHistory])

  useEffect(() => {
    if (!zjMode) return
    validateZhejiangInput(form)
      .then((res) => {
        if (res.zhejiang) setComplianceIssues(res.issues ?? [])
      })
      .catch(() => {})
  }, [form, zjMode])

  const toggleSubject = (s: string) => {
    setForm((prev) => {
      const has = prev.subjects.includes(s)
      if (has) return { ...prev, subjects: prev.subjects.filter((x) => x !== s) }
      if (isZhejiang(prev.province) && prev.subjects.length >= ZHEJIANG_ELECTIVE_COUNT) {
        return prev
      }
      return { ...prev, subjects: [...prev.subjects, s] }
    })
  }

  const handleProvinceChange = (province: string) => {
    setForm((prev) => {
      if (province === '浙江') {
        return {
          ...prev,
          province,
          subjectType: prev.subjectType === '综合' ? '物理类' : prev.subjectType,
          batchSegment: prev.batchSegment ?? '一段',
          examYear: prev.examYear ?? 2025,
          subjects: prev.subjects.length === ZHEJIANG_ELECTIVE_COUNT
            ? prev.subjects
            : ['物理', '化学', '生物'],
        }
      }
      return { ...prev, province }
    })
    setComplianceIssues([])
  }

  const handleGenerate = async () => {
    if (!userId) { setMessage('请先登录'); return }
    if (!form.rank || form.rank <= 0) { setMessage('请输入有效位次'); return }

    if (zjMode) {
      const check = await validateZhejiangInput(form)
      setComplianceIssues(check.issues ?? [])
      if (!check.valid) {
        setMessage('请修正填报信息后再生成')
        return
      }
    }

    setLoading(true)
    setMessage(null)
    try {
      const payload = zjMode
        ? { ...form, batchType: form.batchSegment === '二段' ? '二段' : '本科' }
        : form
      const res = await generateVolunteerScheme(userId, payload)
      if (!res.success) {
        setMessage(res.message || '生成失败')
        return
      }
      setItems(res.items ?? [])
      setTierStrategy(res.tierStrategy ?? buildTierStrategyFromItems(res.items ?? []))
      setSchemeId(res.scheme?.schemeId ?? null)
      setSchemeName(res.scheme?.schemeName ?? '')
      if (res.compliance?.warnings?.length) {
        setComplianceIssues((prev) => [...prev, ...res.compliance!.warnings!])
      }
      setMessage(
        `已生成 ${res.summary?.total ?? 0} 条推荐（冲 ${res.summary?.rush ?? 0} / 稳 ${res.summary?.stable ?? 0} / 保 ${res.summary?.safe ?? 0}）`,
      )
      setView('form')
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
      await loadHistory()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '生成失败')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!schemeId || !userId) { setMessage('请先生成方案'); return }

    if (zjMode) {
      const check = await validateZhejiangInput({ ...form, items })
      setComplianceIssues(check.issues ?? [])
      if (!check.valid) {
        setMessage('志愿表不合规，请修正后再保存')
        return
      }
    }

    setSaving(true)
    setMessage(null)
    try {
      const normalized = items.map((item, idx) => ({ ...item, sortOrder: idx + 1 }))
      const res = await updateVolunteerScheme(schemeId, userId, {
        schemeName: schemeName || undefined,
        status: 'saved',
        items: normalized,
      })
      if (!res.success) {
        setMessage(res.message || '保存失败')
        return
      }
      setItems(res.items ?? normalized)
      setMessage('方案已保存')
      await loadHistory()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleExportExcel = () => {
    if (!items.length) return
    exportVolunteerSchemeExcel(items, form, schemeName || undefined)
  }

  const handleExportPdf = async () => {
    if (!items.length) return
    setExporting('pdf')
    try {
      await exportVolunteerSchemePdf(items, form, schemeName || undefined)
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'PDF 导出失败')
    } finally {
      setExporting(null)
    }
  }

  const handleLoadScheme = async (id: string) => {
    setLoading(true)
    setMessage(null)
    try {
      const res = await fetchVolunteerScheme(id, userId)
      if (!res.success || !res.scheme) {
        setMessage(res.message || '加载失败')
        return
      }
      const ext = res.scheme.inputExt ?? {}
      setSchemeId(res.scheme.schemeId)
      setSchemeName(res.scheme.schemeName ?? '')
      setForm({
        province: res.scheme.province,
        subjectType: res.scheme.subjectType,
        subjects: res.scheme.subjects ?? [],
        score: res.scheme.score,
        rank: res.scheme.rank,
        intendedMajors: res.scheme.intendedMajors ?? [],
        batchType: res.scheme.batchType ?? '本科',
        examYear: res.scheme.examYear ?? (ext.examYear as number | undefined) ?? 2025,
        batchSegment: res.scheme.batchSegment ?? (ext.batchSegment as '一段' | '二段' | undefined) ?? '一段',
      })
      setItems(res.items ?? [])
      setTierStrategy(buildTierStrategyFromItems(res.items ?? []))
      setComplianceIssues([])
      setView('form')
      const count = res.items?.length ?? 0
      setMessage(
        count > 0
          ? `已加载历史方案，共 ${count} 条志愿（冲/稳/保）`
          : '已加载方案，但暂无志愿条目，请点击「生成志愿方案」重新生成',
      )
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150)
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index).map((item, i) => ({ ...item, sortOrder: i + 1 })))
  }

  const onDragStart = (index: number) => setDragIndex(index)
  const onDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    if (dragIndex == null || dragIndex === index) return
    setItems((prev) => {
      const next = [...prev]
      const [moved] = next.splice(dragIndex, 1)
      next.splice(index, 0, moved)
      return next.map((item, i) => ({ ...item, sortOrder: i + 1 }))
    })
    setDragIndex(index)
  }
  const onDragEnd = () => setDragIndex(null)

  const toggleExpand = (key: string) => {
    setExpandedKey((prev) => (prev === key ? null : key))
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <DashboardHeader title="高考志愿填报" featureNavRole="student" />
      <ZhejiangRulesModal open={rulesOpen} onClose={() => setRulesOpen(false)} />

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setView('form')}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${view === 'form' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300'}`}
          >
            新建 / 编辑方案
          </button>
          <button
            type="button"
            onClick={() => setView('history')}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${view === 'history' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300'}`}
          >
            历史方案 ({history.length})
          </button>
          {zjMode && (
            <button
              type="button"
              onClick={() => setRulesOpen(true)}
              className="rounded-lg border border-cyan-600/40 bg-cyan-950/30 px-4 py-2 text-sm text-cyan-200 hover:bg-cyan-900/30"
            >
              浙江投档规则
            </button>
          )}
        </div>

        {message && (
          <div className="mb-4 rounded-lg border border-blue-500/30 bg-blue-950/40 px-4 py-3 text-sm text-blue-100">
            {message}
          </div>
        )}

        {view === 'history' ? (
          <div className="rounded-2xl border border-slate-700/50 bg-slate-900/60 p-6">
            <h2 className="mb-4 text-lg font-semibold text-slate-100">历史志愿方案</h2>
            {history.length === 0 ? (
              <p className="text-sm text-slate-400">暂无方案，请先新建生成。</p>
            ) : (
              <div className="space-y-3">
                {history.map((s) => (
                  <button
                    key={s.schemeId}
                    type="button"
                    onClick={() => handleLoadScheme(s.schemeId)}
                    className="flex w-full items-center justify-between rounded-xl border border-slate-700/60 bg-slate-800/50 px-4 py-3 text-left transition hover:border-blue-500/40"
                  >
                    <div>
                      <p className="font-medium text-slate-100">{s.schemeName || '未命名方案'}</p>
                      <p className="mt-1 text-xs text-slate-400">
                        {s.province} · {s.subjectType} · 位次 {s.rank.toLocaleString()} · {s.status}
                        {s.itemCount != null && (
                          <span className={s.itemCount > 0 ? ' text-cyan-400' : ' text-amber-400'}>
                            {' '}· {s.itemCount > 0 ? `${s.itemCount} 条志愿` : '无志愿条目'}
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="text-xs font-medium text-blue-400">查看 →</span>
                      <span className="text-xs text-slate-500">
                        {s.updatedAt ? new Date(s.updatedAt).toLocaleString('zh-CN') : ''}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-5">
            <section className="rounded-2xl border border-slate-700/50 bg-slate-900/60 p-6 lg:col-span-2">
              <h2 className="mb-4 text-lg font-semibold text-blue-100">考生信息</h2>

              {zjMode && <ComplianceAlert issues={complianceIssues} className="mb-4" />}

              <div className="space-y-4">
                <label className="block text-sm">
                  <span className="text-slate-300">省份</span>
                  <select
                    value={form.province}
                    onChange={(e) => handleProvinceChange(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-white"
                  >
                    {GAOBAO_PROVINCE_NAMES.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </label>

                {zjMode && (
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block text-sm">
                      <span className="text-slate-300">高考年份</span>
                      <select
                        value={form.examYear ?? 2025}
                        onChange={(e) => setForm((f) => ({ ...f, examYear: Number(e.target.value) }))}
                        className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-white"
                      >
                        {EXAM_YEAR_OPTIONS.map((y) => (
                          <option key={y} value={y}>{y}年</option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-sm">
                      <span className="text-slate-300">批次</span>
                      <select
                        value={form.batchSegment ?? '一段'}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            batchSegment: e.target.value as '一段' | '二段',
                            batchType: e.target.value === '二段' ? '二段' : '本科',
                          }))
                        }
                        className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-white"
                      >
                        {ZHEJIANG_BATCH_SEGMENTS.map((b) => (
                          <option key={b} value={b}>{b}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                )}

                <label className="block text-sm">
                  <span className="text-slate-300">科类</span>
                  <select
                    value={form.subjectType}
                    onChange={(e) => setForm((f) => ({ ...f, subjectType: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-white"
                  >
                    {subjectTypes.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </label>

                <div className="text-sm">
                  <span className="text-slate-300">
                    选考科目
                    {zjMode && (
                      <span className="ml-2 text-xs text-slate-500">
                        （7选3，已选 {form.subjects.length}/{ZHEJIANG_ELECTIVE_COUNT}）
                      </span>
                    )}
                  </span>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {electiveOptions.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => toggleSubject(s)}
                        className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                          form.subjects.includes(s)
                            ? 'bg-cyan-600 text-white'
                            : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>

                {zjMode ? (
                  <ScoreRankLinkedInput
                    score={form.score}
                    rank={form.rank}
                    examYear={form.examYear}
                    subjectType={form.subjectType}
                    batchSegment={form.batchSegment}
                    province={form.province}
                    onScoreChange={(score) => setForm((f) => ({ ...f, score }))}
                    onRankChange={(rank) => setForm((f) => ({ ...f, rank }))}
                    disabled={loading}
                  />
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block text-sm">
                      <span className="text-slate-300">高考分数</span>
                      <input
                        type="number"
                        value={form.score ?? ''}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, score: e.target.value ? Number(e.target.value) : undefined }))
                        }
                        className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-white"
                        placeholder="可选"
                      />
                    </label>
                    <label className="block text-sm">
                      <span className="text-slate-300">省排位次 *</span>
                      <input
                        type="number"
                        value={form.rank}
                        onChange={(e) => setForm((f) => ({ ...f, rank: Number(e.target.value) }))}
                        className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-white"
                        required
                      />
                    </label>
                  </div>
                )}

                <label className="block text-sm">
                  <span className="text-slate-300">意向专业（逗号分隔）</span>
                  <input
                    type="text"
                    value={form.intendedMajors.join('，')}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        intendedMajors: e.target.value.split(/[,，]/).map((s) => s.trim()).filter(Boolean),
                      }))
                    }
                    className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-white"
                    placeholder="如：计算机，软件工程"
                  />
                </label>

                {schemeId && (
                  <label className="block text-sm">
                    <span className="text-slate-300">方案名称</span>
                    <input
                      type="text"
                      value={schemeName}
                      onChange={(e) => setSchemeName(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-white"
                    />
                  </label>
                )}

                <div className="flex flex-wrap gap-3 pt-2">
                  <button
                    type="button"
                    disabled={loading}
                    onClick={handleGenerate}
                    className="rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg disabled:opacity-50"
                  >
                    {loading ? '生成中…' : '生成志愿方案'}
                  </button>
                  {schemeId && items.length > 0 && (
                    <>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={handleSave}
                        className="rounded-xl border border-emerald-500/50 bg-emerald-950/40 px-5 py-2.5 text-sm font-semibold text-emerald-100 disabled:opacity-50"
                      >
                        {saving ? '保存中…' : '保存方案'}
                      </button>
                      <button
                        type="button"
                        disabled={exporting != null}
                        onClick={handleExportExcel}
                        className="rounded-xl border border-slate-600 bg-slate-800 px-4 py-2.5 text-sm text-slate-200 disabled:opacity-50"
                      >
                        导出 Excel
                      </button>
                      <button
                        type="button"
                        disabled={exporting != null}
                        onClick={handleExportPdf}
                        className="rounded-xl border border-slate-600 bg-slate-800 px-4 py-2.5 text-sm text-slate-200 disabled:opacity-50"
                      >
                        {exporting === 'pdf' ? '导出中…' : '导出 PDF'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </section>

            <section ref={resultsRef} className="lg:col-span-3 scroll-mt-6">
              {zjMode ? (
                <VolunteerResultsPanel
                  items={items}
                  userRank={form.rank}
                  userSubjects={form.subjects}
                  tierStrategy={tierStrategy}
                  batchSegment={form.batchSegment}
                  expandedKey={expandedKey}
                  dragIndex={dragIndex}
                  onToggleExpand={toggleExpand}
                  onRemoveItem={removeItem}
                  onDragStart={onDragStart}
                  onDragOver={onDragOver}
                  onDragEnd={onDragEnd}
                />
              ) : (
                <LegacyVolunteerResultsTable
                  items={items}
                  grouped={grouped}
                  tierStrategy={tierStrategy}
                  dragIndex={dragIndex}
                  onDragStart={onDragStart}
                  onDragOver={onDragOver}
                  onDragEnd={onDragEnd}
                  onRemoveItem={removeItem}
                />
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  )
}
