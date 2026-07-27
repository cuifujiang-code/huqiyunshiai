import { useMemo } from 'react'
import { DEFAULT_TIER_GUIDE, ZHEJIANG_VOLUNTEER_LIMIT } from '../../data/zhejiangVolunteer'
import type { TierStrategySummary, VolunteerItem, VolunteerTierLabel } from '../../types/volunteer'
import VolunteerCollegeCard, { TierSummaryCards, TIER_COLORS } from './VolunteerCollegeCard'

interface VolunteerResultsPanelProps {
  items: VolunteerItem[]
  userRank: number
  userSubjects: string[]
  tierStrategy?: TierStrategySummary | null
  batchSegment?: string
  expandedKey: string | null
  dragIndex: number | null
  onToggleExpand: (key: string) => void
  onRemoveItem: (index: number) => void
  onDragStart: (index: number) => void
  onDragOver: (e: React.DragEvent, index: number) => void
  onDragEnd: () => void
  viewMode?: 'cards' | 'table'
}

function itemKey(item: VolunteerItem) {
  return `${item.collegeName}-${item.majorName}-${item.sortOrder}`
}

export default function VolunteerResultsPanel({
  items,
  userRank,
  userSubjects,
  tierStrategy,
  batchSegment,
  expandedKey,
  dragIndex,
  onToggleExpand,
  onRemoveItem,
  onDragStart,
  onDragOver,
  onDragEnd,
  viewMode = 'cards',
}: VolunteerResultsPanelProps) {
  const grouped = useMemo(() => {
    const g: Record<VolunteerTierLabel, VolunteerItem[]> = { 冲: [], 稳: [], 保: [] }
    for (const item of items) g[item.tierLabel]?.push(item)
    return g
  }, [items])

  const enrichedStrategy = tierStrategy ?? {
    冲: { count: grouped.冲.length, guide: DEFAULT_TIER_GUIDE.冲, avgProbability: null },
    稳: { count: grouped.稳.length, guide: DEFAULT_TIER_GUIDE.稳, avgProbability: null },
    保: { count: grouped.保.length, guide: DEFAULT_TIER_GUIDE.保, avgProbability: null },
  }

  if (!items.length) {
    return (
      <div className="flex h-full min-h-[320px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-700/60 bg-slate-900/40 p-8 text-center text-slate-400">
        <p>填写信息后点击「生成志愿方案」，系统将按冲/稳/保梯度推荐院校专业</p>
        <p className="mt-2 text-xs text-slate-500">从历史方案进入时，请确认该方案含有志愿条目；无条目的空方案需重新生成</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-300">
          共 {items.length} 条推荐
          {batchSegment ? ` · ${batchSegment}` : ''}
        </p>
        {batchSegment && (
          <p className="text-xs text-slate-500">
            {batchSegment}最多 {ZHEJIANG_VOLUNTEER_LIMIT} 个平行志愿
          </p>
        )}
      </div>

      <TierSummaryCards grouped={grouped} tierStrategy={enrichedStrategy} />

      {(['冲', '稳', '保'] as VolunteerTierLabel[]).map((tier) =>
        grouped[tier].length > 0 ? (
          <div key={tier} className={`overflow-hidden rounded-2xl border ${TIER_COLORS[tier]}`}>
            <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
              <span className="text-sm font-medium text-slate-200">{tier}档</span>
              <span className="text-xs text-slate-400">{grouped[tier].length} 条</span>
            </div>
            <div className="space-y-3 p-4">
              {grouped[tier].map((item) => {
                const globalIdx = items.findIndex(
                  (x) =>
                    x.collegeName === item.collegeName &&
                    x.majorName === item.majorName &&
                    x.sortOrder === item.sortOrder,
                )
                const key = itemKey(item)
                return (
                  <VolunteerCollegeCard
                    key={key}
                    item={item}
                    userRank={userRank}
                    userSubjects={userSubjects}
                    expanded={expandedKey === key}
                    draggable={viewMode === 'cards'}
                    dragActive={dragIndex === globalIdx}
                    onToggleExpand={() => onToggleExpand(key)}
                    onRemove={() => onRemoveItem(globalIdx)}
                    onDragStart={() => onDragStart(globalIdx)}
                    onDragOver={(e) => onDragOver(e, globalIdx)}
                    onDragEnd={onDragEnd}
                  />
                )
              })}
            </div>
          </div>
        ) : null,
      )}

      <p className="text-xs text-slate-500">
        提示：展开卡片查看策略与历年录取；拖拽可调整志愿顺序（卡片视图）。
      </p>
    </div>
  )
}
