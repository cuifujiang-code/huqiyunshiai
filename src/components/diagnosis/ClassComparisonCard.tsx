import { useMemo } from 'react'
import type { ClassComparison } from '../../types/diagnosis'

interface Props {
  data: ClassComparison
}

export default function ClassComparisonCard({ data }: Props) {
  const maxDist = useMemo(() => Math.max(...data.scoreDistribution.map((d) => d.count), 1), [data.scoreDistribution])

  const rankLabel = () => {
    const ratio = data.studentRank / data.totalStudents
    if (ratio <= 0.1) return { text: '名列前茅', color: 'text-emerald-300', bg: 'bg-emerald-500/10' }
    if (ratio <= 0.3) return { text: '优秀', color: 'text-cyan-300', bg: 'bg-cyan-500/10' }
    if (ratio <= 0.5) return { text: '中等偏上', color: 'text-blue-300', bg: 'bg-blue-500/10' }
    if (ratio <= 0.7) return { text: '中等', color: 'text-amber-300', bg: 'bg-amber-500/10' }
    return { text: '需努力', color: 'text-orange-300', bg: 'bg-orange-500/10' }
  }

  const lbl = rankLabel()

  return (
    <div className="rounded-2xl border border-blue-500/20 bg-slate-900/60 p-5">
      <h3 className="mb-1 text-sm font-semibold text-blue-100">班级/年级对比</h3>
      <p className="mb-4 text-xs text-slate-500">你在班级和年级中的相对位置</p>

      {/* 排名概览 */}
      <div className="mb-4 flex flex-wrap gap-3">
        <div className="flex-1 rounded-xl bg-slate-800/60 p-3 text-center">
          <p className="text-xs text-slate-400">年级排名</p>
          <p className="mt-1 text-xl font-bold text-cyan-300">
            {data.studentRank}
            <span className="text-xs text-slate-500">/{data.totalStudents}</span>
          </p>
          <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs ${lbl.bg} ${lbl.color}`}>{lbl.text}</span>
        </div>
        <div className="flex-1 rounded-xl bg-slate-800/60 p-3 text-center">
          <p className="text-xs text-slate-400">超越百分比</p>
          <p className="mt-1 text-xl font-bold text-cyan-300">{data.percentile}%</p>
          <p className="mt-1 text-xs text-slate-500">战胜 {data.strongerThan} 人</p>
        </div>
        <div className="flex-1 rounded-xl bg-slate-800/60 p-3 text-center">
          <p className="text-xs text-slate-400">班级均分</p>
          <p className="mt-1 text-xl font-bold text-blue-300">{data.classAvg}</p>
          <p className="mt-1 text-xs text-slate-500">年级均分 {data.gradeAvg}</p>
        </div>
      </div>

      {/* 对比条 */}
      <div className="mb-4 space-y-2.5">
        <div>
          <div className="mb-1 flex justify-between text-xs">
            <span className="text-slate-400">你的得分</span>
            <span className="text-cyan-300">{data.studentScore}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-700/60">
            <div
              className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all"
              style={{ width: `${Math.min((data.studentScore / data.gradeTop) * 100, 100)}%` }}
            />
          </div>
        </div>
        <div>
          <div className="mb-1 flex justify-between text-xs">
            <span className="text-slate-400">班级均分</span>
            <span className="text-blue-300">{data.classAvg}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-700/60">
            <div
              className="h-full rounded-full bg-blue-500/70 transition-all"
              style={{ width: `${Math.min((data.classAvg / data.gradeTop) * 100, 100)}%` }}
            />
          </div>
        </div>
        <div>
          <div className="mb-1 flex justify-between text-xs">
            <span className="text-slate-400">年级均分</span>
            <span className="text-slate-300">{data.gradeAvg}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-700/60">
            <div
              className="h-full rounded-full bg-slate-500/70 transition-all"
              style={{ width: `${Math.min((data.gradeAvg / data.gradeTop) * 100, 100)}%` }}
            />
          </div>
        </div>
        <div>
          <div className="mb-1 flex justify-between text-xs">
            <span className="text-slate-400">年级最高</span>
            <span className="text-amber-300">{data.gradeTop}</span>
          </div>
        </div>
      </div>

      {/* 分数分布柱状图 */}
      <div>
        <p className="mb-2 text-xs text-slate-500">年级分数分布</p>
        <div className="flex items-end gap-1" style={{ height: 80 }}>
          {data.scoreDistribution.map((d) => (
            <div key={d.range} className="flex flex-1 flex-col items-center justify-end">
              <span className="mb-1 text-[10px] text-slate-500">{d.count}</span>
              <div
                className="w-full rounded-t-sm bg-gradient-to-t from-blue-600/80 to-cyan-500/60 transition-all"
                style={{ height: `${Math.max((d.count / maxDist) * 100, 3)}%` }}
              />
              <span className="mt-1 text-[9px] text-slate-600">{d.range}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
