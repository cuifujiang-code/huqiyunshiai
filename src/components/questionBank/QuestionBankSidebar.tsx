import { useMemo } from 'react'
import type { ReactNode } from 'react'
import TopicSidebar from './TopicSidebar'
import type { TopicGroup } from '../../types/teacher'

export type SidebarTab = 'knowledge' | 'topic'

interface TreeNode {
  id: string
  label: string
  level: string
  children?: TreeNode[]
}

interface Props {
  subjectLabel: string
  grade: string
  subject: string
  collapsed: boolean
  onToggleCollapse: () => void
  showTopicTab: boolean
  activeTab: SidebarTab
  onTabChange: (tab: SidebarTab) => void
  kpSearch: string
  onKpSearchChange: (v: string) => void
  tree: TreeNode[]
  renderTreeNode: (node: TreeNode, depth: number) => ReactNode
  topicGroups: TopicGroup[]
  selectedTopicTag: string
  selectedTopicGroup?: string
  onTopicTagChange: (tag: string, group?: string) => void
}

/** 组卷网风格左侧栏：知识点 / 专题分类 双 Tab */
export default function QuestionBankSidebar(props: Props) {
  const {
    subjectLabel,
    grade,
    subject,
    collapsed,
    onToggleCollapse,
    showTopicTab,
    activeTab,
    onTabChange,
    kpSearch,
    onKpSearchChange,
    tree,
    renderTreeNode,
    topicGroups,
    selectedTopicTag,
    selectedTopicGroup,
    onTopicTagChange,
  } = props

  const filteredTree = useMemo(() => {
    const q = kpSearch.trim().toLowerCase()
    if (!q) return tree
    const filterNodes = (nodes: TreeNode[]): TreeNode[] => nodes.flatMap((node) => {
      if (node.level === 'knowledge_point') {
        return node.label.toLowerCase().includes(q) ? [node] : []
      }
      const children = node.children ? filterNodes(node.children) : []
      if (children.length > 0 || node.label.toLowerCase().includes(q)) {
        return [{ ...node, children }]
      }
      return []
    })
    return filterNodes(tree)
  }, [tree, kpSearch])

  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-3 py-4 h-full" style={{ backgroundColor: '#1C2332', width: 48 }}>
        <button
          type="button"
          className="rounded-[8px] p-1.5 text-[#8A94A9] hover:text-[#E8ECF3] hover:bg-white/[0.06] transition"
          onClick={onToggleCollapse}
          title="展开侧边栏"
        >
          <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
        <button
          type="button"
          title="知识点"
          className={`rounded-[8px] p-1.5 text-xs ${activeTab === 'knowledge' ? 'bg-[#2584FF]/20 text-[#5C9DFF]' : 'text-[#8A94A9]'}`}
          onClick={() => { onToggleCollapse(); onTabChange('knowledge') }}
        >
          知
        </button>
        {showTopicTab && (
          <button
            type="button"
            title="专题分类"
            className={`rounded-[8px] p-1.5 text-xs ${activeTab === 'topic' ? 'bg-[#2584FF]/20 text-[#5C9DFF]' : 'text-[#8A94A9]'}`}
            onClick={() => { onToggleCollapse(); onTabChange('topic') }}
          >
            专
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: '#1C2332' }}>
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/[0.06] shrink-0">
        <span className="text-sm font-semibold text-[#E8ECF3] truncate">{subjectLabel}</span>
        <button
          type="button"
          className="rounded-[6px] p-1 text-[#8A94A9] hover:text-[#E8ECF3] hover:bg-white/[0.06] transition"
          onClick={onToggleCollapse}
          title="收起侧边栏"
        >
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
      </div>

      {showTopicTab && (
        <div className="shrink-0 flex border-b border-white/[0.06]">
          <button
            type="button"
            className={`flex-1 py-2.5 text-xs font-medium transition border-b-2 ${
              activeTab === 'knowledge'
                ? 'border-[#2584FF] text-[#5C9DFF]'
                : 'border-transparent text-[#8A94A9] hover:text-[#C8CFDF]'
            }`}
            onClick={() => onTabChange('knowledge')}
          >
            知识点
          </button>
          <button
            type="button"
            className={`flex-1 py-2.5 text-xs font-medium transition border-b-2 ${
              activeTab === 'topic'
                ? 'border-[#2584FF] text-[#5C9DFF]'
                : 'border-transparent text-[#8A94A9] hover:text-[#C8CFDF]'
            }`}
            onClick={() => onTabChange('topic')}
          >
            专题分类
          </button>
        </div>
      )}

      {activeTab === 'knowledge' || !showTopicTab ? (
        <>
          <div className="shrink-0 px-2 py-2 border-b border-white/[0.06]">
            <input
              className="w-full rounded-[6px] border border-white/[0.08] bg-[#121722] px-2 py-1.5 text-xs text-[#E8ECF3] placeholder-[#6B7394] outline-none focus:border-[#2584FF]"
              placeholder="知识点立即查询"
              value={kpSearch}
              onChange={(e) => onKpSearchChange(e.target.value)}
            />
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto py-2 px-1">
            {filteredTree.map((gradeNode) => renderTreeNode(gradeNode, 0))}
          </div>
        </>
      ) : (
        <TopicSidebar
          fullHeight
          grade={grade}
          subject={subject}
          groups={topicGroups}
          selectedTag={selectedTopicTag}
          selectedGroup={selectedTopicGroup}
          onTagChange={onTopicTagChange}
        />
      )}
    </div>
  )
}
