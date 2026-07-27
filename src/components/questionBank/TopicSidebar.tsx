import { useEffect, useMemo, useState } from 'react'
import { mergeTopicGroups } from '../../data/topicTaxonomy'
import type { TopicGroup } from '../../types/teacher'

interface Props {
  groups: TopicGroup[]
  grade: string
  subject: string
  selectedTag: string
  selectedGroup?: string
  onTagChange: (tag: string, group?: string) => void
  panelTitle?: string
  fullHeight?: boolean
}

/**
 * 全学段 · 全科目统一专题侧栏（一级可折叠 + 二级考点）
 */
export default function TopicSidebar({
  groups,
  grade,
  subject,
  selectedTag,
  selectedGroup,
  onTagChange,
  panelTitle = '专题分类',
  fullHeight,
}: Props) {
  const merged = useMemo(
    () => mergeTopicGroups(groups, grade, subject),
    [groups, grade, subject],
  )
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const totalCount = useMemo(() => merged.reduce((s, g) => s + g.count, 0), [merged])

  useEffect(() => {
    if (!merged.length) return
    setExpanded((prev) => {
      const next = new Set(prev)
      if (selectedTag || selectedGroup) {
        const g = merged.find(
          (gr) => gr.group === selectedGroup || gr.tags.some((t) => t.tag === selectedTag),
        )
        if (g) next.add(g.group)
      } else if (next.size === 0) {
        next.add(merged[0].group)
      }
      return next
    })
  }, [merged, selectedTag, selectedGroup])

  if (!merged.length) return null

  const toggleGroup = (group: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(group)) next.delete(group)
      else next.add(group)
      return next
    })
  }

  return (
    <div className={`flex flex-col min-h-0 ${fullHeight ? 'flex-1 h-full' : 'border-t border-white/[0.08]'}`}>
      {!fullHeight && (
        <div className="shrink-0 flex items-center justify-between gap-2 px-3 py-2.5 bg-[#181e2a]">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-[#E8ECF3]">{panelTitle}</p>
            <p className="text-[10px] text-[#6B7394] truncate">{merged.length} 模块 · {totalCount} 题</p>
          </div>
          <button
            type="button"
            className={`shrink-0 rounded-[6px] px-2 py-0.5 text-[10px] border transition ${
              !selectedTag
                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                : 'text-[#8A94A9] border-white/[0.08] hover:text-[#E8ECF3]'
            }`}
            onClick={() => onTagChange('')}
          >
            全部
          </button>
        </div>
      )}

      {fullHeight && (
        <div className="shrink-0 flex items-center justify-between px-3 py-2 border-b border-white/[0.06]">
          <span className="text-[10px] text-[#6B7394]">{merged.length} 模块 · {totalCount} 题</span>
          <button
            type="button"
            className={`rounded-[6px] px-2 py-0.5 text-[10px] border transition ${
              !selectedTag ? 'text-emerald-400 border-emerald-500/30' : 'text-[#8A94A9] border-white/[0.08]'
            }`}
            onClick={() => onTagChange('')}
          >
            全部专题
          </button>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto py-1 px-1">
        {merged.map((group) => {
          const isOpen = expanded.has(group.group)
          const hasActive = group.tags.some((t) => t.tag === selectedTag) || selectedGroup === group.group
          return (
            <div key={group.group} className="mb-0.5">
              <button
                type="button"
                className={`w-full flex items-center gap-1 rounded-[6px] px-2 py-1.5 text-left transition ${
                  hasActive ? 'bg-[#2584FF]/12 text-[#5C9DFF]' : 'text-[#C8CFDF] hover:bg-white/[0.04]'
                }`}
                onClick={() => toggleGroup(group.group)}
              >
                <svg
                  width={12}
                  height={12}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={`shrink-0 transition-transform duration-150 ${isOpen ? 'rotate-90' : ''}`}
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
                <span className="flex-1 min-w-0 text-[11px] font-medium leading-snug truncate" title={group.group}>
                  {group.group}
                </span>
                <span className="shrink-0 text-[10px] tabular-nums text-[#6B7394]">{group.count}</span>
              </button>

              {isOpen && (
                <div className="ml-3 mt-0.5 mb-1 space-y-0.5 border-l border-white/[0.06] pl-2">
                  {group.tags.map(({ tag, count }) => {
                    const active = selectedTag === tag
                    const empty = count <= 0
                    return (
                      <button
                        key={tag}
                        type="button"
                        title={tag}
                        className={`w-full flex items-center gap-1 rounded-[5px] px-2 py-1 text-left text-[10px] leading-snug transition ${
                          active
                            ? 'bg-[#2584FF] text-white'
                            : empty
                              ? 'text-[#5A6270] hover:bg-white/[0.03]'
                              : 'text-[#8A94A9] hover:bg-white/[0.04] hover:text-[#E8ECF3]'
                        }`}
                        onClick={(e) => {
                          e.stopPropagation()
                          onTagChange(active ? '' : tag, group.group)
                        }}
                      >
                        <span className="flex-1 min-w-0 truncate">{tag}</span>
                        <span className={`shrink-0 tabular-nums ${active ? 'text-white/75' : 'text-[#6B7394]'}`}>
                          {count}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
