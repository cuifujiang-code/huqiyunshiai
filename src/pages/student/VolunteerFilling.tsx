import { useCallback, useEffect, useMemo, useState } from 'react'
import DashboardHeader from '../../components/layout/DashboardHeader'
import { useAuth } from '../../context/AuthContext'
import { GAOBAO_PROVINCE_NAMES } from '../../data/gaokaoProvinces2025'
import {
  fetchVolunteerScheme,
  fetchVolunteerSchemes,
  generateVolunteerScheme,
  updateVolunteerScheme,
} from '../../lib/volunteerApi'
import type {
  VolunteerFormInput,
  VolunteerItem,
  VolunteerSchemeSummary,
  VolunteerTierLabel,
} from '../../types/volunteer'

const SUBJECT_TYPES = ['物理类', '历史类', '综合'] as const
const ELECTIVE_OPTIONS = ['物理', '化学', '生物', '历史', '政治', '地理', '技术']
const TIER_COLORS: Record<VolunteerTierLabel, string> = {
  冲: 'border-rose-500/40 bg-rose-950/30',
  稳: 'border-amber-500/40 bg-amber-950/30',
  保: 'border-emerald-500/40 bg-emerald-950/30',
}
const TIER_BADGE: Record<VolunteerTierLabel, string> = {
  冲: 'bg-rose-600/80 text-rose-50',
  稳: 'bg-amber-600/80 text-amber-50',
  保: 'bg-emerald-600/80 text-emerald-50',
}

function pct(p?: number) {
  if (p == null) return '—'
  return `${(p * 100).toFixed(1)}%`
}

function defaultForm(): VolunteerFormInput {
  return {
    province: '浙江',
    subjectType: '物理类',
    subjects: ['物理', '化学'],
    score: undefined,
    rank: 30000,
    intendedMajors: ['计算机'],
    batchType: '本科',
  }
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
  const [view, setView] = useState<'form' | 'history'>('form')

  const grouped = useMemo(() => {
    const g: Record<VolunteerTierLabel, VolunteerItem[]> = { 冲: [], 稳: [], 保: [] }
    for (const item of items) {
      g[item.tierLabel]?.push(item)
    }
    return g
  }, [items])

  const loadHistory = useCallback(async () => {
    if (!userId) return
    const res = await fetchVolunteerSchemes(userId)
    if (res.success && res.schemes) setHistory(res.schemes)
  }, [userId])

  useEffect(() => { loadHistory().catch(() => {}) }, [loadHistory])

  const toggleSubject = (s: string) => {
    setForm((prev) => ({
      ...prev,
      subjects: prev.subjects.includes(s)
        ? prev.subjects.filter((x) => x !== s)
        : [...prev.subjects, s],
    }))
  }

  const handleGenerate = async () => {
    if (!userId) { setMessage('请先登录'); return }
    if (!form.rank || form.rank <= 0) { setMessage('请输入有效位次'); return }
    setLoading(true)
    setMessage(null)
    try {
      const res = await generateVolunteerScheme(userId, form)
      if (!res.success) {
        setMessage(res.message || '生成失败')
        return
      }
      setItems(res.items ?? [])
      setSchemeId(res.scheme?.schemeId ?? null)
      setSchemeName(res.scheme?.schemeName ?? '')
      setMessage(
        `已生成 ${res.summary?.total ?? 0} 条推荐（冲 ${res.summary?.rush ?? 0} / 稳 ${res.summary?.stable ?? 0} / 保 ${res.summary?.safe ?? 0}）`,
      )
      await loadHistory()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '生成失败')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!schemeId || !userId) { setMessage('请先生成方案'); return }
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

  const handleLoadScheme = async (id: string) => {
    setLoading(true)
    setMessage(null)
    try {
      const res = await fetchVolunteerScheme(id, userId)
      if (!res.success || !res.scheme) {
        setMessage(res.message || '加载失败')
        return
      }
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
      })
      setItems(res.items ?? [])
      setView('form')
      setMessage('已加载历史方案')
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

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <DashboardHeader title="高考志愿填报" featureNavRole="student" />

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
                      </p>
                    </div>
                    <span className="text-xs text-slate-500">
                      {s.updatedAt ? new Date(s.updatedAt).toLocaleString('zh-CN') : ''}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-5">
            {/* 输入表单 */}
            <section className="rounded-2xl border border-slate-700/50 bg-slate-900/60 p-6 lg:col-span-2">
              <h2 className="mb-4 text-lg font-semibold text-blue-100">考生信息</h2>
              <div className="space-y-4">
                <label className="block text-sm">
                  <span className="text-slate-300">省份</span>
                  <select
                    value={form.province}
                    onChange={(e) => setForm((f) => ({ ...f, province: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-white"
                  >
                    {GAOBAO_PROVINCE_NAMES.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </label>

                <label className="block text-sm">
                  <span className="text-slate-300">科类</span>
                  <select
                    value={form.subjectType}
                    onChange={(e) => setForm((f) => ({ ...f, subjectType: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-white"
                  >
                    {SUBJECT_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </label>

                <div className="text-sm">
                  <span className="text-slate-300">选考科目</span>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {ELECTIVE_OPTIONS.map((s) => (
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

                <div className="grid grid-cols-2 gap-3">
                  <label className="block text-sm">
                    <span className="text-slate-300">高考分数</span>
                    <input
                      type="number"
                      value={form.score ?? ''}
                      onChange={(e) => setForm((f) => ({ ...f, score: e.target.value ? Number(e.target.value) : undefined }))}
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
                    <button
                      type="button"
                      disabled={saving}
                      onClick={handleSave}
                      className="rounded-xl border border-emerald-500/50 bg-emerald-950/40 px-5 py-2.5 text-sm font-semibold text-emerald-100 disabled:opacity-50"
                    >
                      {saving ? '保存中…' : '保存方案'}
                    </button>
                  )}
                </div>
              </div>
            </section>

            {/* 结果展示 */}
            <section className="lg:col-span-3">
              {items.length === 0 ? (
                <div className="flex h-full min-h-[320px] items-center justify-center rounded-2xl border border-dashed border-slate-700/60 bg-slate-900/40 p-8 text-center text-slate-400">
                  填写信息后点击「生成志愿方案」，系统将按冲/稳/保梯度推荐院校专业
                </div>
              ) : (
                <div className="space-y-6">
                  {/* 概览卡片 */}
                  <div className="grid grid-cols-3 gap-3">
                    {(['冲', '稳', '保'] as VolunteerTierLabel[]).map((tier) => (
                      <div key={tier} className={`rounded-xl border p-4 ${TIER_COLORS[tier]}`}>
                        <p className="text-xs text-slate-400">{tier}档</p>
                        <p className="mt-1 text-2xl font-bold">{grouped[tier].length}</p>
                        <p className="mt-1 text-xs text-slate-400">
                          平均概率 {pct(
                            grouped[tier].length
                              ? grouped[tier].reduce((a, i) => a + (i.probability ?? 0), 0) / grouped[tier].length
                              : undefined,
                          )}
                        </p>
                      </div>
                    ))}
                  </div>

                  {/* 冲稳保分组表格 */}
                  {(['冲', '稳', '保'] as VolunteerTierLabel[]).map((tier) =>
                    grouped[tier].length > 0 ? (
                      <div key={tier} className={`overflow-hidden rounded-2xl border ${TIER_COLORS[tier]}`}>
                        <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
                          <span className={`rounded px-2 py-0.5 text-xs font-bold ${TIER_BADGE[tier]}`}>{tier}</span>
                          <span className="text-sm text-slate-300">{grouped[tier].length} 条推荐</span>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full min-w-[640px] text-left text-sm">
                            <thead>
                              <tr className="border-b border-white/10 text-xs text-slate-400">
                                <th className="px-3 py-2 w-8">#</th>
                                <th className="px-3 py-2">院校 / 专业</th>
                                <th className="px-3 py-2">梯度</th>
                                <th className="px-3 py-2">录取概率</th>
                                <th className="px-3 py-2">预测位次</th>
                                <th className="px-3 py-2">参考分</th>
                                <th className="px-3 py-2 w-12" />
                              </tr>
                            </thead>
                            <tbody>
                              {grouped[tier].map((item) => {
                                const globalIdx = items.findIndex(
                                  (x) => x.collegeName === item.collegeName && x.majorName === item.majorName,
                                )
                                return (
                                  <tr
                                    key={`${item.collegeName}-${item.majorName}-${item.sortOrder}`}
                                    draggable
                                    onDragStart={() => onDragStart(globalIdx)}
                                    onDragOver={(e) => onDragOver(e, globalIdx)}
                                    onDragEnd={onDragEnd}
                                    className={`border-b border-white/5 transition ${dragIndex === globalIdx ? 'opacity-50' : 'hover:bg-white/5'} cursor-grab`}
                                  >
                                    <td className="px-3 py-2.5 text-slate-500">{item.sortOrder}</td>
                                    <td className="px-3 py-2.5">
                                      <p className="font-medium text-slate-100">{item.collegeName}</p>
                                      <p className="text-xs text-slate-400">{item.majorName}</p>
                                    </td>
                                    <td className="px-3 py-2.5 text-xs text-slate-300">{item.gradientLevel ?? '—'}</td>
                                    <td className="px-3 py-2.5 font-medium text-cyan-300">{pct(item.probability)}</td>
                                    <td className="px-3 py-2.5 text-slate-300">
                                      {item.predictedRank?.toLocaleString() ?? '—'}
                                    </td>
                                    <td className="px-3 py-2.5 text-slate-300">
                                      {item.avgScore ?? item.minScore ?? '—'}
                                    </td>
                                    <td className="px-3 py-2.5">
                                      <button
                                        type="button"
                                        onClick={() => removeItem(globalIdx)}
                                        className="text-xs text-rose-400 hover:text-rose-300"
                                      >
                                        删除
                                      </button>
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ) : null,
                  )}

                  <p className="text-xs text-slate-500">
                    提示：拖拽表格行可调整志愿顺序；删除后请点击「保存方案」持久化。
                  </p>
                </div>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  )
}
