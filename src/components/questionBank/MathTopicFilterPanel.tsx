import { useMemo, useState } from 'react'
import type { MathTopicGroup } from '../types/teacher'

interface Props {
  groups: MathTopicGroup[]
  selectedTag: string
  onTagChange: (tag: string, group?: string) => void
}

/**
 * 高中数学专题 — 分组折叠 + 二级考点横向标签
 */
export default function MathTopicFilterPanel({ groups, selectedTag, onTagChange }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const init = new Set<string>()
    if (selectedTag) {
      const g = groups.find((gr) => gr.tags.some((t) => t.tag === selectedTag))
      if (g) init.add(g.group)
    } else if (groups.length) {
      init.add(groups[0].group)
    }
    return init
  })

  const totalCount = useMemo(
    () => groups.reduce((sum, g) => sum + g.count, 0),
    [groups],
  )

  if (!groups.length) {
    return (
      <div className="mb-3 rounded-[10px] border border-white/[0.06] bg-[#121722] px-4 py-3">
        <p className="text-xs text-[#8A94A9]">暂无已分类的数学专题题目，录入题目后将按高考标准考点自动归类。</p>
      </div>
    )
  }

  const toggleGroup = (group: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(group)) next.delete(group)
      else next.add(group)
      return next
    })
  }

  return (
    <div className="mb-3 rounded-[10px] border border-white/[0.08] bg-[#121722] overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-white/[0.06] px-4 py-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-semibold text-[#E8ECF3] shrink-0">高考专题</span>
          <span className="text-[10px] text-[#6B7394] truncate">共 {groups.length} 个模块 · {totalCount} 题</span>
        </div>
        <button
          type="button"
          className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-medium transition border ${
            !selectedTag
              ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
              : 'bg-white/[0.03] text-[#8A94A9] border-white/[0.08] hover:text-[#E8ECF3]'
          }`}
          onClick={() => onTagChange('')}
        >
          全部专题
        </button>
      </div>

      <div className="divide-y divide-white/[0.04]">
        {groups.map((group) => {
          const isOpen = expanded.has(group.group)
          const hasActive = group.tags.some((t) => t.tag === selectedTag)
          return (
            <div key={group.group} className="px-4 py-2">
              <button
                type="button"
                className={`flex w-full items-center gap-2 rounded-[8px] px-2 py-1.5 text-left transition hover:bg-white/[0.03] ${
                  hasActive ? 'bg-[#2584FF]/8' : ''
                }`}
                onClick={() => toggleGroup(group.group)}
              >
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] text-[#8A94A9] transition ${
                    isOpen ? 'rotate-90' : ''
                  }`}
                >
                  ▸
                </span>
                <span className="flex-1 min-w-0 text-xs font-medium text-[#C8CFDF] truncate">
                  {group.group}
                </span>
                <span className="shrink-0 rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] text-[#8A94A9]">
                  {group.count}
                </span>
              </button>

              {isOpen && (
                <div className="mt-2 ml-7 flex flex-wrap gap-1.5 pb-1">
                  {group.tags.map(({ tag, count }) => {
                    const active = selectedTag === tag
                    return (
                      <button
                        key={tag}
                        type="button"
                        title={tag}
                        className={`max-w-full rounded-full px-2.5 py-1 text-[11px] leading-snug transition border truncate ${
                          active
                            ? 'bg-[#2584FF] text-white border-[#2584FF] shadow-sm shadow-[#2584FF]/20'
                            : 'bg-white/[0.03] text-[#A8B0C0] border-white/[0.08] hover:border-[#2584FF]/35 hover:text-[#E8ECF3]'
                        }`}
                        onClick={() => onTagChange(active ? '' : tag, group.group)}
                      >
                        <span className="truncate">{tag}</span>
                        <span className={`ml-1 tabular-nums ${active ? 'text-white/80' : 'text-[#6B7394]'}`}>
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
