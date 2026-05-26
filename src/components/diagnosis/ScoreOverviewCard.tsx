import type { DiagnosisReport } from '../../types/diagnosis'

function RingProgress({ percent }: { percent: number }) {
  const r = 40
  const c = 2 * Math.PI * r
  const offset = c - (percent / 100) * c
  return (
    <svg width="100" height="100" className="-rotate-90">
      <circle cx="50" cy="50" r={r} fill="none" stroke="#1e293b" strokeWidth="8" />
      <circle cx="50" cy="50" r={r} fill="none" stroke="#38bdf8" strokeWidth="8" strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round" />
      <text x="50" y="55" textAnchor="middle" className="rotate-90 fill-slate-200 text-sm font-bold" transform="rotate(90 50 50)">{percent}%</text>
    </svg>
  )
}

export default function ScoreOverviewCard({ overview }: { overview: DiagnosisReport['scoreOverview'] }) {
  const trendColor = overview.trend === 'up' ? 'text-emerald-400' : overview.trend === 'down' ? 'text-red-400' : 'text-slate-400'
  const trendIcon = overview.trend === 'up' ? '↑' : overview.trend === 'down' ? '↓' : '→'
  const trendText =
    overview.rankImprovement != null && overview.rankImprovement > 0
      ? `较上次排名进步 ${overview.rankImprovement} 名`
      : overview.trend === 'up'
        ? `较上次进步 ${overview.trendDelta} 分`
        : overview.trend === 'down'
          ? `较上次退步 ${Math.abs(overview.trendDelta)} 分`
          : '与上次持平'

  return (
    <div className="rounded-2xl border border-blue-500/20 bg-slate-900/60 p-5 sm:p-6">
      <h3 className="mb-4 text-base font-semibold text-blue-200">成绩总览</h3>
      <div className="flex flex-col items-center gap-6 sm:flex-row sm:justify-between">
        <div className="space-y-2 text-sm text-slate-300">
          <p>考试分数：<span className="text-xl font-bold text-white">{overview.score}</span> / {overview.fullScore}</p>
          {overview.gradeRank != null && (
            <p>
              年级排名：第 {overview.gradeRank} 名
              {overview.gradeTotal != null && `（共 ${overview.gradeTotal} 人）`}
              {overview.previousRank != null && `，上次第 ${overview.previousRank} 名`}
            </p>
          )}
          {overview.classRank != null && <p>班级排名：第 {overview.classRank} 名</p>}
          <p className={trendColor}>{trendIcon} {trendText}</p>
        </div>
        <div className="text-center">
          <RingProgress percent={overview.percentile} />
          <p className="mt-2 text-xs text-slate-400">超越同级约 {overview.percentile}% 同学</p>
        </div>
      </div>
    </div>
  )
}
