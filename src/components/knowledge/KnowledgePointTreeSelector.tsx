import { useMemo, useState } from 'react'
import {
  filterKnowledgeTreeBySubjectGrade,
  flattenKnowledgeTree,
  selectableKnowledgeLevels,
  type KnowledgeTreeNode,
} from '../../lib/knowledgePointTree'

interface Props {
  subject: string
  grade: string
  value: string[]
  onChange: (ids: string[]) => void
  disabled?: boolean
  className?: string
}

function TreeNodeRow({
  node,
  depth,
  selected,
  expanded,
  onToggleExpand,
  onToggleSelect,
  disabled,
}: {
  node: KnowledgeTreeNode
  depth: number
  selected: Set<string>
  expanded: Set<string>
  onToggleExpand: (id: string) => void
  onToggleSelect: (node: KnowledgeTreeNode) => void
  disabled?: boolean
}) {
  const hasChildren = node.children.length > 0
  const isExpanded = expanded.has(node.id)
  const isSelected = selected.has(node.uuid)
  const canSelect = selectableKnowledgeLevels(node.level)

  return (
    <div>
      <div
        className="flex items-center gap-2 py-1 text-sm hover:bg-white/[0.04] rounded px-1"
        style={{ paddingLeft: depth * 16 }}
      >
        {hasChildren ? (
          <button
            type="button"
            className="w-5 shrink-0 text-[#8A94A9] hover:text-[#E8ECF3]"
            onClick={() => onToggleExpand(node.id)}
            disabled={disabled}
          >
            {isExpanded ? '▾' : '▸'}
          </button>
        ) : (
          <span className="w-5 shrink-0" />
        )}
        {canSelect ? (
          <label className="flex flex-1 cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={isSelected}
              disabled={disabled}
              onChange={() => onToggleSelect(node)}
            />
            <span className={isSelected ? 'text-cyan-300' : 'text-[#E8ECF3]'}>{node.name}</span>
            <span className="text-[10px] text-[#6B7394]">
              {node.level === 'knowledge_point' ? '知识点' : '考点'}
            </span>
          </label>
        ) : (
          <button
            type="button"
            className="flex flex-1 items-center gap-2 text-left text-[#C5CAD8]"
            onClick={() => hasChildren && onToggleExpand(node.id)}
            disabled={disabled}
          >
            <span>{node.name}</span>
            <span className="text-[10px] text-[#6B7394]">
              {node.level === 'grade' ? '年级' : '章节'}
            </span>
          </button>
        )}
      </div>
      {hasChildren && isExpanded && (
        <div>
          {node.children.map((child) => (
            <TreeNodeRow
              key={child.id}
              node={child}
              depth={depth + 1}
              selected={selected}
              expanded={expanded}
              onToggleExpand={onToggleExpand}
              onToggleSelect={onToggleSelect}
              disabled={disabled}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default function KnowledgePointTreeSelector({
  subject,
  grade,
  value,
  onChange,
  disabled,
  className = '',
}: Props) {
  const tree = useMemo(
    () => filterKnowledgeTreeBySubjectGrade(subject, grade),
    [subject, grade],
  )
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(tree.map((g) => g.id)))

  const selected = useMemo(() => new Set(value), [value])

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelect = (node: KnowledgeTreeNode) => {
    if (!selectableKnowledgeLevels(node.level)) return
    const next = new Set(value)
    if (next.has(node.uuid)) next.delete(node.uuid)
    else next.add(node.uuid)
    onChange([...next])
  }

  const flat = useMemo(() => flattenKnowledgeTree(tree), [tree])
  const selectedLabels = value
    .map((id) => flat.find((n) => n.uuid === id)?.name)
    .filter(Boolean)

  return (
    <div className={`rounded-lg border border-white/[0.08] bg-[#1C2332]/80 p-3 ${className}`}>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-[#8A94A9]">知识点树（可多选考点/知识点）</span>
        {!disabled && value.length > 0 && (
          <button
            type="button"
            className="text-xs text-red-400 hover:text-red-300"
            onClick={() => onChange([])}
          >
            清空
          </button>
        )}
      </div>
      {selectedLabels.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1">
          {selectedLabels.map((label) => (
            <span
              key={label}
              className="rounded border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-[11px] text-cyan-200"
            >
              {label}
            </span>
          ))}
        </div>
      )}
      <div className="max-h-48 overflow-y-auto">
        {tree.length === 0 ? (
          <p className="text-xs text-[#6B7394]">当前学科/年级暂无知识树数据</p>
        ) : (
          tree.map((node) => (
            <TreeNodeRow
              key={node.id}
              node={node}
              depth={0}
              selected={selected}
              expanded={expanded}
              onToggleExpand={toggleExpand}
              onToggleSelect={toggleSelect}
              disabled={disabled}
            />
          ))
        )}
      </div>
    </div>
  )
}
