import { useMemo } from 'react'
import { getTopicTaxonomy, hasTopicTaxonomy } from '../../data/topicTaxonomy'
import type { BankQuestion } from '../../types/teacher'
import { selectClass } from '../../types/teacher'

interface Props {
  draft: BankQuestion
  onChange: (patch: Partial<BankQuestion>) => void
  disabled?: boolean
}

/** 手动归类：一级大主题 + 二级考点 */
export default function QuestionTopicFields({ draft, onChange, disabled }: Props) {
  const grade = draft.grade || ''
  const subject = draft.subject || ''
  const taxonomy = useMemo(() => getTopicTaxonomy(grade, subject), [grade, subject])

  if (!hasTopicTaxonomy(grade, subject)) return null

  const tagOptions = useMemo(() => {
    if (!draft.topic_group) return []
    const g = taxonomy.find((x) => x.group === draft.topic_group)
    return g?.tags ?? []
  }, [draft.topic_group, taxonomy])

  const handleGroupChange = (topic_group: string) => {
    onChange({ topic_group, topic_tag: '' })
  }

  const handleTagChange = (topic_tag: string) => {
    const group = taxonomy.find((g) => g.tags.includes(topic_tag))?.group ?? draft.topic_group ?? ''
    const allStandard = new Set(taxonomy.flatMap((g) => g.tags))
    const tags = topic_tag
      ? [topic_tag, ...(draft.tags ?? []).filter((t) => !allStandard.has(t))]
      : (draft.tags ?? []).filter((t) => !allStandard.has(t))
    onChange({ topic_group: group, topic_tag, tags })
  }

  return (
    <div className="rounded-[10px] border border-[#2584FF]/20 bg-[#2584FF]/5 p-3 space-y-3">
      <div>
        <p className="text-xs font-medium text-[#5C9DFF]">专题归类</p>
        <p className="text-[10px] text-[#8A94A9] mt-0.5">
          {grade}{subject} · 保存后用于左侧「专题分类」筛选与统计，上传拆题将自动匹配
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs text-[#8A94A9]">一级大主题</span>
          <select
            className={selectClass}
            value={draft.topic_group ?? ''}
            onChange={(e) => handleGroupChange(e.target.value)}
            disabled={disabled}
          >
            <option value="">请选择大主题</option>
            {taxonomy.map((g) => (
              <option key={g.group} value={g.group}>{g.group}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-[#8A94A9]">二级考点</span>
          <select
            className={selectClass}
            value={draft.topic_tag ?? ''}
            onChange={(e) => handleTagChange(e.target.value)}
            disabled={disabled || !draft.topic_group}
          >
            <option value="">请选择考点</option>
            {tagOptions.map((tag) => (
              <option key={tag} value={tag}>{tag}</option>
            ))}
          </select>
        </label>
      </div>
      {(draft.topic_group || draft.topic_tag) && (
        <p className="text-[10px] text-emerald-400/90">
          已归类：{draft.topic_group}{draft.topic_tag ? ` → ${draft.topic_tag}` : ''}
        </p>
      )}
    </div>
  )
}
