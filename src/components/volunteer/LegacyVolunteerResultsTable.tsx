import { DEFAULT_TIER_GUIDE, TIER_BADGE, TIER_COLORS } from '../../data/zhejiangVolunteer'
import type { TierStrategySummary, VolunteerItem, VolunteerTierLabel } from '../../types/volunteer'

function pct(p?: number) {
  if (p == null) return '—'
  return `${(p * 100).toFixed(1)}%`
}

interface LegacyVolunteerResultsTableProps {
  items: VolunteerItem[]
  grouped: Record<VolunteerTierLabel, VolunteerItem[]>
  tierStrategy?: TierStrategySummary | null
  dragIndex: number | null
  onDragStart: (index: number) => void
  onDragOver: (e: React.DragEvent, index: number) => void
  onDragEnd: () => void
  onRemoveItem: (index: number) => void
}

export default function LegacyVolunteerResultsTable({
  items,
  grouped,
  tierStrategy,
  dragIndex,
  onDragStart,
  onDragOver,
  onDragEnd,
  onRemoveItem,
}: LegacyVolunteerResultsTableProps) {
  if (!items.length) {
    return (
      <div className="flex h-full min-h-[320px] items-center justify-center rounded-2xl border border-dashed border-slate-700/60 bg-slate-900/40 p-8 text-center text-slate-400">
        填写信息后点击「生成志愿方案」，系统将按冲/稳/保梯度推荐院校专业
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {(['冲', '稳', '保'] as VolunteerTierLabel[]).map((tier) => {
          const strategy = tierStrategy?.[tier]
          return (
            <div key={tier} className={`rounded-xl border p-4 ${TIER_COLORS[tier]}`}>
              <p className="text-xs text-slate-400">{tier}档</p>
              <p className="mt-1 text-2xl font-bold">{grouped[tier].length}</p>
              <p className="mt-1 text-xs text-slate-400">
                平均概率 {pct(strategy?.avgProbability ?? (
                  grouped[tier].length
                    ? grouped[tier].reduce((a, i) => a + (i.probability ?? 0), 0) / grouped[tier].length
                    : undefined
                ))}
              </p>
              <p className="mt-2 text-xs leading-relaxed text-slate-300">
                {strategy?.guide ?? DEFAULT_TIER_GUIDE[tier]}
              </p>
            </div>
          )
        })}
      </div>

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
                    <th className="w-8 px-3 py-2">#</th>
                    <th className="px-3 py-2">院校 / 专业</th>
                    <th className="px-3 py-2">梯度</th>
                    <th className="px-3 py-2">录取概率</th>
                    <th className="px-3 py-2">预测位次</th>
                    <th className="px-3 py-2">参考分</th>
                    <th className="w-12 px-3 py-2" />
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
                        className={`cursor-grab border-b border-white/5 transition ${
                          dragIndex === globalIdx ? 'opacity-50' : 'hover:bg-white/5'
                        }`}
                      >
                        <td className="px-3 py-2.5 text-slate-500">{item.sortOrder}</td>
                        <td className="px-3 py-2.5">
                          <p className="font-medium text-slate-100">{item.collegeName}</p>
                          <p className="text-xs text-slate-400">{item.majorName}</p>
                          {item.subjectRequirement && (
                            <p className="mt-0.5 text-xs text-cyan-400/80">选科要求：{item.subjectRequirement}</p>
                          )}
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
                            onClick={() => onRemoveItem(globalIdx)}
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

      <p className="text-xs text-slate-500">提示：拖拽表格行可调整志愿顺序；删除后请点击「保存方案」持久化。</p>
    </div>
  )
}
