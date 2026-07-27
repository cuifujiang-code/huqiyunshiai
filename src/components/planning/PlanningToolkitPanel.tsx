import { useMemo, useRef, useState } from 'react'
import { Bar } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js'
import * as XLSX from 'xlsx'
import { useAuth } from '../../context/AuthContext'
import {
  fetchSubjectAnalysis,
  fetchActionChecklist,
  type SubjectRecommendation,
  type ActionChecklistWeek,
  type PracticeTip,
} from '../../lib/planningToolkitApi'
import {
  analyzeBatchRows,
  summarizeBatchRows,
  validateBatchHeaders,
  mapRowKeys,
  ROUTE_COLORS,
  ROUTE_CHART_COLORS,
  type BatchStudentRow,
  type BatchRouteCategory,
} from '../../lib/batchStudentClassifier'

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend)

const ELECTIVE_INPUTS = ['物理', '历史', '化学', '生物', '政治', '地理'] as const
const CHECKLIST_GRADES = ['初三', '高一', '高二', '高三'] as const
const CHECKLIST_GOALS = ['冲刺985', '稳定211', '省内重本', '艺术联考', '出国留学'] as const
const WEAK_SUBJECTS = ['语文', '数学', '英语', '物理', '化学', '生物', '历史', '地理', '政治'] as const

const inputClass =
  'w-full rounded-xl border border-[#2A3444] bg-[#151C28] px-4 py-2.5 text-sm text-[#E8ECF3] outline-none transition focus:border-[#2584FF] focus:ring-2 focus:ring-[#2584FF]/20'
const selectClass = inputClass
const labelClass = 'mb-1.5 block text-sm font-medium text-[#B0B9C8]'
const cardClass = 'rounded-2xl border border-white/[0.06] bg-[#1C2332]/80 p-5 sm:p-6'

export default function PlanningToolkitPanel() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="mb-2">
        <h2 className="text-lg font-bold text-[#E8ECF3]">规划工具箱</h2>
        <p className="mt-1 text-xs text-[#6B7588]">选科决策、90天行动清单与批量学生分类，助力教师高效规划</p>
      </div>
      <SubjectSelectionCard />
      <ActionChecklistCard />
      <BatchClassificationCard />
    </div>
  )
}

// ============================================================
// 卡片1 — 选科辅助决策
// ============================================================

function SubjectSelectionCard() {
  const [scores, setScores] = useState<Record<string, string>>(
    Object.fromEntries(ELECTIVE_INPUTS.map((s) => [s, ''])),
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [recommendations, setRecommendations] = useState<SubjectRecommendation[]>([])
  const [advice, setAdvice] = useState('')

  const handleAnalyze = async () => {
    setLoading(true)
    setError(null)
    try {
      const numericScores = Object.fromEntries(
        ELECTIVE_INPUTS.map((s) => [s, scores[s] === '' ? null : Number(scores[s])]),
      )
      const hasAny = ELECTIVE_INPUTS.some((s) => numericScores[s] != null && numericScores[s]! > 0)
      if (!hasAny) {
        setError('请至少填写一门选科成绩')
        return
      }
      const res = await fetchSubjectAnalysis(numericScores)
      setRecommendations(res.recommendations)
      setAdvice(res.advice)
    } catch (err) {
      setError(err instanceof Error ? err.message : '分析失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <ToolkitCard
      title="选科辅助决策工具"
      desc="输入6门选考科目成绩，系统推荐最优选科组合及专业覆盖率"
      icon="🎯"
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {ELECTIVE_INPUTS.map((subject) => (
          <div key={subject}>
            <label className={labelClass}>{subject}</label>
            <input
              type="number"
              min={0}
              max={100}
              value={scores[subject]}
              onChange={(e) => setScores((prev) => ({ ...prev, [subject]: e.target.value }))}
              placeholder="0-100"
              className={inputClass}
            />
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={handleAnalyze}
        disabled={loading}
        className="mt-4 rounded-xl bg-[#2584FF] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#1a6fe0] disabled:opacity-50"
      >
        {loading ? '分析中…' : '一键分析'}
      </button>
      {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
      {recommendations.length > 0 && (
        <div className="mt-5 space-y-3 border-t border-white/[0.06] pt-4">
          <p className="text-xs font-semibold text-[#8A94A9]">推荐选科组合（Top 3）</p>
          {recommendations.map((rec, i) => (
            <div key={rec.combo} className="rounded-xl border border-white/[0.06] bg-[#161D2B]/60 p-4">
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-medium text-[#E8ECF3]">
                  {i + 1}. {rec.combo}
                </span>
                <span className="shrink-0 rounded-full bg-cyan-500/15 px-2 py-0.5 text-[10px] text-cyan-300">
                  {rec.subjectType}
                </span>
              </div>
              <p className="mt-1 text-xs text-[#8A94A9]">
                覆盖专业数：{rec.majorCount.toLocaleString()} 个 · 覆盖率 {rec.coverageRate}%
              </p>
              <p className="mt-0.5 text-[10px] text-[#6B7588]">组合科目均分：{rec.scoreAvg}</p>
            </div>
          ))}
          {advice && (
            <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
              <p className="mb-1 text-xs font-semibold text-blue-300">选科建议</p>
              <p className="text-xs leading-relaxed text-[#B0B9C8]">{advice}</p>
            </div>
          )}
        </div>
      )}
    </ToolkitCard>
  )
}

// ============================================================
// 卡片2 — 90天行动清单
// ============================================================

function ActionChecklistCard() {
  const { profile } = useAuth()
  const printRef = useRef<HTMLDivElement>(null)
  const [grade, setGrade] = useState<string>(CHECKLIST_GRADES[1])
  const [goal, setGoal] = useState<string>(CHECKLIST_GOALS[0])
  const [weakSubject, setWeakSubject] = useState<string>(WEAK_SUBJECTS[1])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [weeks, setWeeks] = useState<ActionChecklistWeek[]>([])
  const [practiceTips, setPracticeTips] = useState<PracticeTip[]>([])

  const handleGenerate = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetchActionChecklist({
        grade,
        goal,
        weakSubject,
        teacherId: profile?.id,
      })
      setWeeks(res.weeks)
      setPracticeTips(res.practiceTips)
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成失败')
    } finally {
      setLoading(false)
    }
  }

  const handlePrint = () => {
    window.print()
  }

  return (
    <ToolkitCard
      title="90天行动清单生成器"
      desc="按年级与目标生成12周标准化行动清单，并附薄弱科目专项练习推荐"
      icon="📋"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label className={labelClass}>学生年级</label>
          <select value={grade} onChange={(e) => setGrade(e.target.value)} className={selectClass}>
            {CHECKLIST_GRADES.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>主目标</label>
          <select value={goal} onChange={(e) => setGoal(e.target.value)} className={selectClass}>
            {CHECKLIST_GOALS.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>当前最薄弱科目</label>
          <select value={weakSubject} onChange={(e) => setWeakSubject(e.target.value)} className={selectClass}>
            {WEAK_SUBJECTS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleGenerate}
          disabled={loading}
          className="rounded-xl bg-[#2584FF] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#1a6fe0] disabled:opacity-50"
        >
          {loading ? '生成中…' : '生成清单'}
        </button>
        {weeks.length > 0 && (
          <button
            type="button"
            onClick={handlePrint}
            className="rounded-xl border border-[#2A3444] px-5 py-2.5 text-sm text-[#B0B9C8] hover:border-[#2584FF]/40 print:hidden"
          >
            打印清单
          </button>
        )}
      </div>
      {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
      {weeks.length > 0 && (
        <div ref={printRef} id="action-checklist-print" className="checklist-print mt-5 border-t border-white/[0.06] pt-4">
          <div className="mb-4 hidden print:block">
            <h3 className="text-lg font-bold text-black">
              {grade} · {goal} · 90天行动清单
            </h3>
            <p className="text-sm text-gray-600">薄弱科目：{weakSubject}</p>
          </div>
          <div className="space-y-3">
            {weeks.map((w) => (
              <div
                key={w.week}
                className="rounded-xl border border-white/[0.06] bg-[#161D2B]/60 p-4 print:border-gray-300 print:bg-white"
              >
                <p className="text-sm font-semibold text-[#E8ECF3] print:text-black">
                  第 {w.week} 周 · {w.focus}
                </p>
                <ul className="mt-2 space-y-1">
                  {(w.tasks || []).map((t) => (
                    <li key={t} className="text-xs text-[#B0B9C8] print:text-gray-700">
                      · {t}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-[11px] text-cyan-400/90 print:text-gray-600">
                  里程碑：{w.milestone}
                </p>
              </div>
            ))}
          </div>
          {practiceTips.length > 0 && (
            <div className="mt-5 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 print:border-gray-300">
              <p className="mb-2 text-xs font-semibold text-amber-300 print:text-black">推荐专项练习</p>
              <ul className="space-y-1">
                {practiceTips.map((tip) => (
                  <li key={tip.knowledgePoint} className="text-xs text-[#B0B9C8] print:text-gray-700">
                    · 【{tip.subject}】{tip.knowledgePoint}（{tip.difficulty}）
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </ToolkitCard>
  )
}

// ============================================================
// 卡片3 — 批量学生分类
// ============================================================

function BatchClassificationCard() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<BatchStudentRow[]>([])
  const [showFormatHelp, setShowFormatHelp] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const summary = useMemo(() => summarizeBatchRows(rows), [rows])

  const chartData = useMemo(
    () => ({
      labels: Object.keys(summary) as BatchRouteCategory[],
      datasets: [
        {
          label: '学生人数',
          data: (Object.keys(summary) as BatchRouteCategory[]).map((k) => summary[k]),
          backgroundColor: (Object.keys(summary) as BatchRouteCategory[]).map(
            (k) => ROUTE_CHART_COLORS[k],
          ),
          borderRadius: 6,
        },
      ],
    }),
    [summary],
  )

  const chartOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#8A94A9', font: { size: 11 } }, grid: { display: false } },
        y: {
          beginAtZero: true,
          ticks: { color: '#8A94A9', stepSize: 1 },
          grid: { color: 'rgba(255,255,255,0.05)' },
        },
      },
    }),
    [],
  )

  const parseFile = async (file: File) => {
    setLoading(true)
    setError(null)
    setRows([])
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const sheet = wb.Sheets[wb.SheetNames[0]]
      const matrix = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, { header: 1, defval: '' })
      if (!matrix.length) {
        setError('文件为空')
        return
      }
      const headers = (matrix[0] || []).map((h) => String(h))
      const headerErr = validateBatchHeaders(headers)
      if (headerErr) {
        setError(headerErr)
        return
      }
      const dataRows = matrix.slice(1).filter((r) => r.some((c) => String(c).trim()))
      const parsed = dataRows.map((r) => {
        const obj: Record<string, unknown> = {}
        headers.forEach((h, i) => {
          obj[h] = r[i]
        })
        return mapRowKeys(obj, headers)
      })
      const analyzed = analyzeBatchRows(parsed)
      if (!analyzed.length) {
        setError('未解析到有效学生数据，请检查「姓名」列是否填写')
        return
      }
      setRows(analyzed)
    } catch (err) {
      setError(err instanceof Error ? err.message : '文件解析失败')
    } finally {
      setLoading(false)
    }
  }

  const handleExport = () => {
    if (!rows.length) return
    const exportRows = rows.map((r) => ({
      姓名: r.name,
      综合竞争力指数: r.competencyScore,
      路线分类: r.category,
      ...r.scores,
    }))
    const ws = XLSX.utils.json_to_sheet(exportRows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '分类结果')
    XLSX.writeFile(wb, `学生升学路线分类_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  return (
    <ToolkitCard
      title="批量学生分类工具"
      desc="上传成绩表，批量计算综合竞争力并自动分类升学路线"
      icon="📊"
    >
      <button
        type="button"
        onClick={() => setShowFormatHelp((v) => !v)}
        className="mb-3 text-xs text-[#2584FF] hover:underline"
      >
        {showFormatHelp ? '收起' : '查看'}表格格式说明
      </button>
      {showFormatHelp && (
        <div className="mb-4 rounded-xl border border-white/[0.06] bg-[#161D2B]/60 p-3 text-xs text-[#8A94A9]">
          <p>· 第一行为表头，必须包含「姓名」「语文」「数学」「英语」列</p>
          <p>· 可选列：物理、化学、生物、历史、地理、政治（用于选科竞争力计算）</p>
          <p>· 支持 .xlsx 与 .csv 格式</p>
        </div>
      )}
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) parseFile(f)
          e.target.value = ''
        }}
      />
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={loading}
        className="rounded-xl border border-dashed border-[#2A3444] px-5 py-3 text-sm text-[#B0B9C8] hover:border-[#2584FF]/50 disabled:opacity-50"
      >
        {loading ? '分析中…' : '选择 .xlsx / .csv 文件'}
      </button>
      {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
      {rows.length > 0 && (
        <div className="mt-5 space-y-5 border-t border-white/[0.06] pt-4">
          <div>
            <p className="mb-3 text-xs font-semibold text-[#8A94A9]">分类汇总（共 {rows.length} 人）</p>
            <div className="h-48">
              <Bar data={chartData} options={chartOptions} />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/[0.06] text-left text-[#8A94A9]">
                  <th className="pb-2 pr-4">姓名</th>
                  <th className="pb-2 pr-4">综合竞争力</th>
                  <th className="pb-2">路线分类</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.name} className="border-b border-white/[0.04]">
                    <td className="py-2 pr-4 text-[#E8ECF3]">{r.name}</td>
                    <td className="py-2 pr-4 tabular-nums text-[#E8ECF3]">{r.competencyScore}</td>
                    <td className="py-2">
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] ${ROUTE_COLORS[r.category]}`}>
                        {r.category}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            onClick={handleExport}
            className="rounded-xl bg-[#2584FF] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#1a6fe0]"
          >
            导出 Excel
          </button>
        </div>
      )}
    </ToolkitCard>
  )
}

// ============================================================
// 通用卡片壳
// ============================================================

function ToolkitCard({
  title,
  desc,
  icon,
  children,
}: {
  title: string
  desc: string
  icon: string
  children: React.ReactNode
}) {
  return (
    <section className={cardClass}>
      <div className="mb-4 flex items-start gap-3 border-b border-white/[0.06] pb-3">
        <span className="text-xl">{icon}</span>
        <div>
          <h3 className="text-sm font-semibold text-[#E8ECF3]">{title}</h3>
          <p className="mt-0.5 text-xs text-[#6B7588]">{desc}</p>
        </div>
      </div>
      {children}
    </section>
  )
}
