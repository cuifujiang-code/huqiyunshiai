import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import DashboardHeader from '../components/layout/DashboardHeader'
import FeatureNav from '../components/layout/FeatureNav'
import MathRenderer from '../components/common/MathRenderer'
import { useAuth } from '../context/AuthContext'
import { fetchAnalyticsDashboard, type AnalyticsDashboard } from '../lib/teacherApi'
import { TEACHER_SUBJECTS, btnSecondary } from '../types/teacher'

function errorRateColor(rate: number | null) {
  if (rate == null) return 'bg-white/[0.04] text-[#8A94A9]'
  if (rate >= 0.6) return 'bg-red-500/20 text-red-300'
  if (rate >= 0.4) return 'bg-amber-500/20 text-amber-300'
  if (rate >= 0.2) return 'bg-yellow-500/15 text-yellow-200'
  return 'bg-emerald-500/15 text-emerald-300'
}

function formatRate(rate: number | null) {
  if (rate == null) return '—'
  return `${(rate * 100).toFixed(1)}%`
}

export default function TeacherAnalyticsPage() {
  const { profile } = useAuth()
  const teacherId = profile?.id ?? ''
  const [subject, setSubject] = useState('数学')
  const [data, setData] = useState<AnalyticsDashboard | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!teacherId) return
    setLoading(true)
    setError(null)
    try {
      const dash = await fetchAnalyticsDashboard(teacherId, subject)
      setData(dash)
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [teacherId, subject])

  useEffect(() => {
    load()
  }, [load])

  const maxError = Math.max(...(data?.knowledge_heatmap.map((h) => h.avg_error_rate ?? 0) ?? [0]), 0.01)

  return (
    <div className="min-h-screen bg-[#0f1419] text-[#E8ECF3]">
      <DashboardHeader title="学情看板" subtitle="知识点错题热力 · 高频错题分析" />
      <FeatureNav role="teacher" />

      <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm text-[#8A94A9]">学科</label>
          <select
            className="rounded-[8px] border border-white/[0.08] bg-[#1C2332] px-3 py-2 text-sm outline-none focus:border-[#2584FF]"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          >
            {TEACHER_SUBJECTS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <button type="button" className={btnSecondary} onClick={load} disabled={loading}>
            {loading ? '刷新中…' : '刷新数据'}
          </button>
          <Link to="/teacher/question-bank" className="text-sm text-[#5C9DFF] hover:underline ml-auto">
            返回题库 →
          </Link>
        </div>

        {error && (
          <p className="rounded-[8px] border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</p>
        )}

        {data && (
          <>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="rounded-[10px] border border-white/[0.08] bg-[#1a2030] p-4">
                <p className="text-xs text-[#8A94A9]">题库题目</p>
                <p className="mt-1 text-2xl font-semibold">{data.total_questions}</p>
              </div>
              <div className="rounded-[10px] border border-white/[0.08] bg-[#1a2030] p-4">
                <p className="text-xs text-[#8A94A9]">知识点覆盖</p>
                <p className="mt-1 text-2xl font-semibold">{data.knowledge_heatmap.length}</p>
              </div>
              <div className="rounded-[10px] border border-white/[0.08] bg-[#1a2030] p-4">
                <p className="text-xs text-[#8A94A9]">高频错题</p>
                <p className="mt-1 text-2xl font-semibold text-red-300">{data.high_error_questions.length}</p>
              </div>
              <div className="rounded-[10px] border border-white/[0.08] bg-[#1a2030] p-4">
                <p className="text-xs text-[#8A94A9]">当前学科</p>
                <p className="mt-1 text-2xl font-semibold">{data.subject}</p>
              </div>
            </div>

            <section className="rounded-[12px] border border-white/[0.08] bg-[#1a2030] p-5">
              <h2 className="mb-4 text-base font-semibold">知识点错题热力图</h2>
              <p className="mb-4 text-xs text-[#8A94A9]">颜色越深表示该知识点平均错误率越高（需答题数据支撑）</p>
              {data.knowledge_heatmap.length === 0 ? (
                <p className="text-sm text-[#8A94A9]">暂无学情数据，学生答题后将自动聚合</p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {data.knowledge_heatmap.map((row) => {
                    const intensity = row.avg_error_rate != null ? row.avg_error_rate / maxError : 0
                    return (
                      <div
                        key={row.knowledge_point}
                        className="rounded-[8px] border border-white/[0.06] p-3 transition hover:border-[#2584FF]/30"
                        style={{
                          backgroundColor: `rgba(239, 68, 68, ${Math.min(0.45, intensity * 0.5)})`,
                        }}
                      >
                        <p className="text-sm font-medium truncate" title={row.knowledge_point}>
                          {row.knowledge_point}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                          <span className={`rounded px-2 py-0.5 ${errorRateColor(row.avg_error_rate)}`}>
                            错误率 {formatRate(row.avg_error_rate)}
                          </span>
                          <span className="text-[#8A94A9]">{row.question_count} 题</span>
                          <span className="text-[#8A94A9]">{row.total_attempts} 次作答</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </section>

            <section className="rounded-[12px] border border-white/[0.08] bg-[#1a2030] p-5">
              <h2 className="mb-4 text-base font-semibold">高频错题 TOP</h2>
              {data.high_error_questions.length === 0 ? (
                <p className="text-sm text-[#8A94A9]">暂无满足条件的高频错题（需 ≥3 次作答且错误率 ≥40%）</p>
              ) : (
                <div className="space-y-3">
                  {data.high_error_questions.map((q, i) => (
                    <div
                      key={q.id}
                      className="rounded-[8px] border border-white/[0.06] bg-[#121722] p-4"
                    >
                      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-semibold text-[#5C9DFF]">#{i + 1}</span>
                        <span className="text-[#8A94A9]">{q.grade} · {q.question_type} · {q.difficulty}</span>
                        <span className="rounded bg-red-500/15 px-2 py-0.5 text-red-300">
                          错误率 {(q.error_rate * 100).toFixed(1)}%
                        </span>
                        {q.avg_score_rate != null && (
                          <span className="rounded bg-white/[0.04] px-2 py-0.5 text-[#8A94A9]">
                            得分率 {(q.avg_score_rate * 100).toFixed(1)}%
                          </span>
                        )}
                        <span className="text-[#6B7394]">{q.total_attempts} 次作答</span>
                      </div>
                      {q.knowledge_point && (
                        <p className="mb-2 text-xs text-violet-300">{q.knowledge_point}</p>
                      )}
                      <MathRenderer text={q.content_preview} className="text-sm text-[#C8CFDF]" />
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  )
}
