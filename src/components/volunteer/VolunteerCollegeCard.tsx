import {
  parseSubjectRequirement,
  rankCompareLabel,
  TIER_BADGE,
  TIER_COLORS,
} from '../../data/zhejiangVolunteer'
import type { HistoricalAdmissionRow, VolunteerItem, VolunteerTierLabel } from '../../types/volunteer'

function pct(p?: number) {
  if (p == null) return '—'
  return `${(p * 100).toFixed(1)}%`
}

function itemDetail(item: VolunteerItem) {
  const ext = item.extJson ?? {}
  return {
    majorIntro: item.majorIntro ?? (ext.majorIntro as string | undefined),
    employment: item.employment ?? (ext.employment as string | undefined),
    curriculum: item.curriculum ?? (ext.curriculum as string[] | undefined) ?? [],
    careerPaths: item.careerPaths ?? (ext.careerPaths as string[] | undefined) ?? [],
    tierExplanation: item.tierExplanation ?? (ext.tierExplanation as string | undefined),
    gradientGuide: item.gradientGuide ?? (ext.gradientGuide as string | undefined),
    historicalAdmission:
      item.historicalAdmission ?? (ext.historicalAdmission as HistoricalAdmissionRow[] | undefined) ?? [],
  }
}

interface SubjectRequirementHighlightProps {
  requirement?: string
  userSubjects: string[]
}

function SubjectRequirementHighlight({ requirement, userSubjects }: SubjectRequirementHighlightProps) {
  const { tokens, raw } = parseSubjectRequirement(requirement)
  if (raw === '不限') {
    return <span className="text-xs text-slate-400">选科要求：不限</span>
  }
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      <span className="text-xs text-slate-500">选科要求：</span>
      {tokens.map((tok) => {
        const matched = userSubjects.includes(tok)
        return (
          <span
            key={tok}
            className={`rounded px-1.5 py-0.5 text-xs font-medium ${
              matched
                ? 'bg-emerald-600/30 text-emerald-200 ring-1 ring-emerald-500/40'
                : 'bg-rose-900/40 text-rose-300 ring-1 ring-rose-500/30'
            }`}
          >
            {tok}
            {matched ? ' ✓' : ''}
          </span>
        )
      })}
    </div>
  )
}

interface VolunteerCollegeCardProps {
  item: VolunteerItem
  userRank: number
  userSubjects: string[]
  expanded: boolean
  draggable?: boolean
  dragActive?: boolean
  onToggleExpand: () => void
  onRemove?: () => void
  onDragStart?: () => void
  onDragOver?: (e: React.DragEvent) => void
  onDragEnd?: () => void
}

export default function VolunteerCollegeCard({
  item,
  userRank,
  userSubjects,
  expanded,
  draggable,
  dragActive,
  onToggleExpand,
  onRemove,
  onDragStart,
  onDragOver,
  onDragEnd,
}: VolunteerCollegeCardProps) {
  const refRank = item.predictedRank ?? item.minRank
  const rankGap = refRank != null ? userRank - refRank : null
  const compare = rankCompareLabel(userRank, refRank)
  const tierGapClass =
    item.tierLabel === '冲'
      ? 'border-l-4 border-l-rose-500'
      : item.tierLabel === '稳'
        ? 'border-l-4 border-l-emerald-500'
        : 'border-l-4 border-l-amber-500'
  const compareToneClass =
    item.tierLabel === '冲'
      ? 'text-rose-400'
      : item.tierLabel === '稳'
        ? 'text-emerald-400'
        : 'text-amber-400'
  const detail = itemDetail(item)

  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      className={`rounded-xl border border-slate-700/50 bg-slate-800/40 p-4 transition ${tierGapClass} ${
        dragActive ? 'opacity-50' : 'hover:border-slate-600/80'
      } ${draggable ? 'cursor-grab' : ''}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-500">#{item.sortOrder}</span>
            <span className={`rounded px-2 py-0.5 text-xs font-bold ${TIER_BADGE[item.tierLabel]}`}>
              {item.tierLabel}
            </span>
            {item.gradientLevel && (
              <span className="text-xs text-slate-400">{item.gradientLevel}</span>
            )}
          </div>
          <p className="mt-1 font-medium text-slate-100">{item.collegeName}</p>
          <p className="text-sm text-slate-400">{item.majorName}</p>
          <SubjectRequirementHighlight
            requirement={item.subjectRequirement}
            userSubjects={userSubjects}
          />
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1 text-right text-sm">
          <span className="font-medium text-cyan-300">{pct(item.probability)}</span>
          <span className="text-xs text-slate-400">
            参考位次 {refRank?.toLocaleString() ?? '—'}
          </span>
          <span className={`text-xs font-medium ${compareToneClass}`}>
            {rankGap != null ? `位次差 ${rankGap > 0 ? '+' : ''}${rankGap.toLocaleString()}` : compare.text}
          </span>
          <span className="text-[10px] text-slate-500">
            {item.tierLabel === '冲' ? '冲刺' : item.tierLabel === '稳' ? '稳妥' : '保底'}
          </span>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-4 border-t border-white/5 pt-3 text-xs text-slate-400">
        <span>预测位次 {item.predictedRank?.toLocaleString() ?? '—'}</span>
        <span>参考分 {item.avgScore ?? item.minScore ?? '—'}</span>
        {item.rankRatio != null && (
          <span>位次比 {(item.rankRatio * 100).toFixed(0)}%</span>
        )}
        {detail.historicalAdmission.length > 0 && (
          <span className="text-slate-500">
            近三年位次 {detail.historicalAdmission.slice(0, 3).map((h) => h.minRank?.toLocaleString() ?? '—').join(' / ')}
          </span>
        )}
      </div>

      <div className="mt-3 flex gap-3">
        <button
          type="button"
          onClick={onToggleExpand}
          className="text-xs text-blue-400 hover:text-blue-300"
        >
          {expanded ? '收起详情' : '展开详情'}
        </button>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="text-xs text-rose-400 hover:text-rose-300"
          >
            删除
          </button>
        )}
      </div>

      {expanded && (
        <div className="mt-4 grid gap-4 border-t border-white/5 pt-4 lg:grid-cols-2">
          <div className="space-y-3">
            <div>
              <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                策略解读
              </h4>
              <p className="text-sm leading-relaxed text-slate-200">
                {detail.tierExplanation ?? '暂无策略说明'}
              </p>
            </div>
            <div>
              <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                专业解读
              </h4>
              <p className="text-sm leading-relaxed text-slate-300">
                {detail.majorIntro ?? '暂无专业介绍，请参考院校招生简章。'}
              </p>
            </div>
          </div>
          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              历年录取参考
            </h4>
            {detail.historicalAdmission.length > 0 ? (
              <div className="overflow-x-auto rounded-lg border border-white/10">
                <table className="w-full min-w-[280px] text-left text-xs">
                  <thead>
                    <tr className="border-b border-white/10 bg-white/5 text-slate-400">
                      <th className="px-2 py-1.5">年份</th>
                      <th className="px-2 py-1.5">最低位次</th>
                      <th className="px-2 py-1.5">最低分</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.historicalAdmission.map((row) => (
                      <tr key={row.year} className="border-b border-white/5">
                        <td className="px-2 py-1.5 text-slate-200">{row.year}</td>
                        <td className="px-2 py-1.5 text-slate-300">
                          {row.minRank?.toLocaleString() ?? '—'}
                        </td>
                        <td className="px-2 py-1.5 text-slate-300">{row.minScore ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-slate-400">暂无历年录取数据</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export { TIER_COLORS, pct }

export function TierSummaryCards({
  grouped,
  tierStrategy,
}: {
  grouped: Record<VolunteerTierLabel, VolunteerItem[]>
  tierStrategy?: {
    冲: { count: number; guide: string; avgProbability: number | null }
    稳: { count: number; guide: string; avgProbability: number | null }
    保: { count: number; guide: string; avgProbability: number | null }
  } | null
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {(['冲', '稳', '保'] as VolunteerTierLabel[]).map((tier) => {
        const strategy = tierStrategy?.[tier]
        const avg =
          strategy?.avgProbability ??
          (grouped[tier].length
            ? grouped[tier].reduce((a, i) => a + (i.probability ?? 0), 0) / grouped[tier].length
            : undefined)
        return (
          <div key={tier} className={`rounded-xl border p-4 ${TIER_COLORS[tier]}`}>
            <p className="text-xs text-slate-400">{tier}档</p>
            <p className="mt-1 text-2xl font-bold">{grouped[tier].length}</p>
            <p className="mt-1 text-xs text-slate-400">平均概率 {pct(avg)}</p>
            <p className="mt-2 text-xs leading-relaxed text-slate-300">
              {strategy?.guide ?? ''}
            </p>
          </div>
        )
      })}
    </div>
  )
}
