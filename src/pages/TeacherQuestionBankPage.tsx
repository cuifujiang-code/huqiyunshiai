import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import DashboardHeader from '../components/layout/DashboardHeader'
import MathRenderer from '../components/common/MathRenderer'
import SplitQuestionEditor from '../components/SplitQuestionEditor'
import LatexFormulaEditor from '../components/common/LatexFormulaEditor'
import GeometryBoard from '../components/common/GeometryBoard'
import { useAuth } from '../context/AuthContext'
import { prepareExamFileForDecompose } from '../lib/examUploadPrepare'
import {
  batchImportQuestions,
  batchUpdateTags,
  batchUpdateVisibility,
  createQuestion,
  deleteQuestions,
  fetchQuestions,
  fetchQuestionStats,
  fetchTopics,
  submitDecomposeTask,
  updateQuestion,
} from '../lib/teacherApi'
import QuestionMetadataFields from '../components/QuestionMetadataFields'
import { sanitizeAnalysisText } from '../lib/analysisText'
import { knowledgeIdsToLegacyString } from '../lib/knowledgePointTree'
import type { BankQuestion } from '../types/teacher'
import {
  DIFFICULTIES,
  QUESTION_SOURCES,
  SUBJECT_QUESTION_TYPES,
  TEACHER_GRADES,
  TEACHER_SUBJECTS,
  ALL_QUESTION_TYPES,
  btnPrimary,
  btnSecondary,
  inputClass,
  selectClass,
} from '../types/teacher'

/* ===================================================================
   Tree Data Types & Constants
   =================================================================== */

type TreeNodeLevel = 'subject' | 'grade' | 'semester' | 'knowledge_point'

interface TreeNode {
  id: string
  label: string
  level: TreeNodeLevel
  children?: TreeNode[]
  icon?: string
}

interface FilterPath {
  subject: string
  grade: string
  semester: string
  knowledge_point: string
}

interface ActiveTag {
  id: string
  label: string
  type: 'subject' | 'grade' | 'semester' | 'knowledge_point' | 'difficulty' | 'question_type' | 'source' | 'year' | 'region' | 'custom'
  onRemove: () => void
}

/* ===================================================================
   Knowledge Points by Subject → Grade → Semester
   =================================================================== */

const KNOWLEDGE_POINTS: Record<string, Record<string, Record<string, string[]>>> = {
  '物理': {
    '七年级': {
      '上册': ['科学入门', '观察生物', '人类的家园——地球', '物质的特性'],
      '下册': ['对环境的察觉', '运动和力', '压强', '地球与宇宙'],
    },
    '八年级': {
      '上册': ['机械运动', '声现象', '物态变化', '光现象', '透镜及其应用', '质量与密度', '测量', '力'],
      '下册': ['力', '运动和力', '压强', '浮力', '功和机械能', '简单机械'],
    },
    '九年级': {
      '上册': ['内能', '内能的利用', '电流和电路', '电压 电阻', '欧姆定律', '电功率', '生活用电', '电与磁'],
      '下册': ['信息的传递', '能源与可持续发展', '声现象归纳', '光现象归纳', '热现象归纳', '力学归纳', '电学归纳'],
    },
    '高一': {
      '上册': ['运动的描述', '匀变速直线运动', '相互作用——力', '牛顿运动定律'],
      '下册': ['曲线运动', '万有引力与航天', '机械能守恒定律', '动量守恒定律'],
    },
    '高二': {
      '上册': ['静电场', '恒定电流', '磁场', '电磁感应'],
      '下册': ['交变电流', '传感器', '机械振动', '机械波', '光', '电磁波', '相对论简介'],
    },
    '高三': {
      '上册': ['热学', '原子物理', '实验专题'],
      '下册': ['力学综合', '电磁学综合', '高考总复习'],
    },
  },
  '数学': {
    '七年级': {
      '上册': ['有理数', '整式的加减', '一元一次方程', '几何图形初步', '实数'],
      '下册': ['相交线与平行线', '平面直角坐标系', '二元一次方程组', '不等式与不等式组', '数据的收集整理与描述'],
    },
    '八年级': {
      '上册': ['三角形', '全等三角形', '轴对称', '整式的乘法与因式分解', '分式'],
      '下册': ['二次根式', '勾股定理', '平行四边形', '一次函数', '数据的分析'],
    },
    '九年级': {
      '上册': ['一元二次方程', '二次函数', '旋转', '圆', '概率初步'],
      '下册': ['反比例函数', '相似', '锐角三角函数', '投影与视图'],
    },
    '高一': {
      '上册': ['集合与常用逻辑用语', '一元二次函数、方程和不等式', '函数概念与性质', '指数函数与对数函数', '三角函数'],
      '下册': ['平面向量', '复数', '立体几何初步', '统计', '概率'],
    },
    '高二': {
      '上册': ['空间向量与立体几何', '直线和圆的方程', '圆锥曲线的方程'],
      '下册': ['数列', '导数及其应用', '计数原理', '随机变量及其分布'],
    },
    '高三': {
      '上册': ['高考一轮复习——代数', '高考一轮复习——几何', '高考一轮复习——概率统计'],
      '下册': ['高考二轮专题', '高考冲刺模拟'],
    },
  },
  '化学': {
    '七年级': {
      '上册': [],
      '下册': [],
    },
    '八年级': {
      '上册': [],
      '下册': [],
    },
    '九年级': {
      '上册': ['走进化学世界', '我们周围的空气', '物质构成的奥秘', '自然界的水', '化学方程式', '碳和碳的氧化物', '燃料及其利用'],
      '下册': ['金属和金属材料', '溶液', '酸和碱', '盐 化肥', '化学与生活'],
    },
    '高一': {
      '上册': ['化学实验基础', '化学计量', '离子反应', '氧化还原反应', '钠及其化合物', '氯及其化合物', '物质的量'],
      '下册': ['硫及其化合物', '氮及其化合物', '硅及其无机非金属材料', '化学反应与能量', '化学反应速率与限度', '有机化合物基础'],
    },
    '高二': {
      '上册': ['化学反应的热效应', '化学反应速率', '化学平衡', '水溶液中的离子平衡'],
      '下册': ['原电池与电解池', '物质结构与性质', '有机化学基础'],
    },
    '高三': {
      '上册': ['化学实验综合', '高考总复习——基本概念', '高考总复习——元素化合物'],
      '下册': ['高考总复习——有机化学', '高考总复习——化学反应原理', '高考冲刺'],
    },
  },
  '语文': {
    '七年级': {
      '上册': ['现代文阅读', '古诗文阅读', '写作', '名著导读', '语言运用'],
      '下册': ['现代文阅读', '古诗文阅读', '写作', '综合性学习', '名著导读'],
    },
    '八年级': {
      '上册': ['新闻阅读', '说明文阅读', '古诗文阅读', '写作', '名著导读'],
      '下册': ['现代文阅读', '古诗文阅读', '写作', '口语交际', '名著导读'],
    },
    '九年级': {
      '上册': ['议论文阅读', '古诗文阅读', '写作', '名著导读'],
      '下册': ['中考复习——现代文', '中考复习——古诗文', '中考复习——写作', '中考冲刺'],
    },
    '高一': {
      '上册': ['必修上册——现代文', '必修上册——古诗文', '写作', '整本书阅读'],
      '下册': ['必修下册——现代文', '必修下册——古诗文', '写作', '整本书阅读'],
    },
    '高二': {
      '上册': ['选择性必修上——现代文', '选择性必修上——古诗文', '写作'],
      '下册': ['选择性必修下——现代文', '选择性必修下——古诗文', '写作'],
    },
    '高三': {
      '上册': ['高考复习——语言文字运用', '高考复习——古代诗文', '高考复习——现代文阅读'],
      '下册': ['高考复习——作文', '高考冲刺模拟'],
    },
  },
  '英语': {
    '七年级': {
      '上册': ['语法', '词汇', '阅读', '写作', '听力'],
      '下册': ['语法', '词汇', '阅读', '写作', '听力'],
    },
    '八年级': {
      '上册': ['语法', '词汇', '阅读', '写作', '听力'],
      '下册': ['语法', '词汇', '阅读', '写作', '听力'],
    },
    '九年级': {
      '上册': ['语法综合', '完形填空', '阅读理解', '书面表达', '中考听力'],
      '下册': ['中考词汇', '中考语法', '中考阅读', '中考写作', '中考冲刺'],
    },
    '高一': {
      '上册': ['必修一——词汇语法', '必修一——阅读', '必修一——写作'],
      '下册': ['必修二——词汇语法', '必修二——阅读', '必修二——写作'],
    },
    '高二': {
      '上册': ['选择性必修一', '选择性必修二——阅读写作'],
      '下册': ['选择性必修三', '选择性必修四——阅读写作'],
    },
    '高三': {
      '上册': ['高考一轮语法', '高考一轮词汇', '高考一轮阅读'],
      '下册': ['高考完形', '高考写作', '高考冲刺'],
    },
  },
  '生物': {
    '七年级': {
      '上册': ['认识生物', '生物体的结构层次', '生物圈中的绿色植物'],
      '下册': ['人的由来', '人体的营养', '人体的呼吸', '人体内物质的运输'],
    },
    '八年级': {
      '上册': ['动物的主要类群', '动物的运动和行为', '细菌和真菌', '生物的多样性及其保护'],
      '下册': ['生物的生殖和发育', '生物的遗传和变异', '生物的进化', '传染病和免疫'],
    },
    '九年级': {
      '上册': ['中考复习——七年级', '中考复习——八年级'],
      '下册': ['中考专题', '中考冲刺'],
    },
    '高一': {
      '上册': ['走进细胞', '组成细胞的分子', '细胞的基本结构', '细胞的物质输入和输出'],
      '下册': ['细胞的能量供应和利用', '细胞的生命历程'],
    },
    '高二': {
      '上册': ['遗传因子的发现', '基因和染色体的关系', '基因的本质', '基因的表达'],
      '下册': ['生物的变异', '育种与进化', '稳态与内环境', '体液调节与神经调节'],
    },
    '高三': {
      '上册': ['高考复习——必修一', '高考复习——必修二'],
      '下册': ['高考复习——选择性必修', '高考冲刺'],
    },
  },
  '历史': {
    '七年级': {
      '上册': ['中国古代史——先秦', '中国古代史——秦汉', '中国古代史——三国两晋南北朝'],
      '下册': ['中国古代史——隋唐', '中国古代史——辽宋夏金元', '中国古代史——明清'],
    },
    '八年级': {
      '上册': ['中国近代史——列强侵略', '中国近代史——近代化探索', '中国近代史——新民主主义革命（上）'],
      '下册': ['中国现代史——建国初期', '中国现代史——社会主义建设', '中国现代史——改革开放'],
    },
    '九年级': {
      '上册': ['世界古代史', '世界近代史——文艺复兴与新航路', '世界近代史——资产阶级革命'],
      '下册': ['世界近代史——工业革命', '世界现代史——一战与二战', '世界现代史——冷战与当代'],
    },
    '高一': {
      '上册': ['中外历史纲要（上）——中国古代史'],
      '下册': ['中外历史纲要（上）——中国近现代史'],
    },
    '高二': {
      '上册': ['中外历史纲要（下）——世界古代史', '中外历史纲要（下）——世界近代史'],
      '下册': ['选择性必修——国家制度', '选择性必修——经济与社会生活'],
    },
    '高三': {
      '上册': ['高考一轮复习——中国古代史', '高考一轮复习——中国近现代史'],
      '下册': ['高考一轮复习——世界史', '高考冲刺'],
    },
  },
  '地理': {
    '七年级': {
      '上册': ['地球和地图', '陆地和海洋', '天气与气候', '居民与聚落'],
      '下册': ['我们生活的大洲——亚洲', '我们邻近的地区和国家', '东半球其他的地区和国家', '西半球的国家'],
    },
    '八年级': {
      '上册': ['中国的疆域与人口', '中国的自然环境', '中国的自然资源', '中国的经济发展'],
      '下册': ['中国的地理差异', '北方地区', '南方地区', '西北地区', '青藏地区'],
    },
    '九年级': {
      '上册': ['中考复习——世界地理', '中考复习——中国地理'],
      '下册': ['中考专题', '中考冲刺'],
    },
    '高一': {
      '上册': ['宇宙中的地球', '地球上的大气', '地球上的水'],
      '下册': ['地貌', '植被与土壤', '自然环境的整体性与差异性'],
    },
    '高二': {
      '上册': ['人口', '聚落', '产业区位', '交通运输布局与区域发展'],
      '下册': ['区域与区域发展', '区域生态环境建设', '资源与国家安全'],
    },
    '高三': {
      '上册': ['高考复习——自然地理', '高考复习——人文地理'],
      '下册': ['高考复习——区域地理', '高考冲刺'],
    },
  },
}

/* ===================================================================
   Build Tree
   =================================================================== */

function buildSubjectTree(): TreeNode[] {
  return TEACHER_SUBJECTS.map((subject) => {
    const subjectKp = KNOWLEDGE_POINTS[subject] || {}
    const grades: TreeNode[] = TEACHER_GRADES.map((grade) => {
      const gradeKp = subjectKp[grade] || {}
      const semesters: TreeNode[] = [
        {
          id: `${subject}-${grade}-上册`,
          label: '上册',
          level: 'semester' as const,
          children: (gradeKp['上册'] || []).map((kp: string) => ({
            id: `${subject}-${grade}-上册-${kp}`,
            label: kp,
            level: 'knowledge_point' as const,
          })),
        },
        {
          id: `${subject}-${grade}-下册`,
          label: '下册',
          level: 'semester' as const,
          children: (gradeKp['下册'] || []).map((kp: string) => ({
            id: `${subject}-${grade}-下册-${kp}`,
            label: kp,
            level: 'knowledge_point' as const,
          })),
        },
      ]
      return {
        id: `${subject}-${grade}`,
        label: grade,
        level: 'grade' as const,
        children: semesters,
      }
    })
    return {
      id: subject,
      label: subject,
      level: 'subject' as const,
      children: grades,
    }
  })
}

const SUBJECT_TREE = buildSubjectTree()

/* ===================================================================
   Helper: parse filter path from node ID
   =================================================================== */

function parseNodeId(nodeId: string): FilterPath {
  const parts = nodeId.split('-')
  const subject = parts[0] || ''
  const grade = parts[1] || ''
  const semester = parts[2] || ''
  const knowledge_point = parts.slice(3).join('-') || ''
  return { subject, grade, semester, knowledge_point }
}

/* ===================================================================
   Empty Question Factory
   =================================================================== */

const emptyQuestion = (): BankQuestion => ({
  subject: '物理',
  grade: '八年级',
  knowledge_point: '',
  knowledge_point_ids: [],
  question_type: '选择题',
  difficulty: '中等',
  content: '',
  options: ['A', 'B', 'C', 'D'],
  answer: '',
  analysis: '',
  source: '手动录入',
  ability_dimension: '',
  suitable_stage: '',
  estimated_time: undefined,
  tags: [],
  visibility: 'personal',
})

/* ===================================================================
   Semantic Icon Map (3 levels)
   =================================================================== */

const LEVEL_ICONS: Record<TreeNodeLevel, string> = {
  subject: '📘',
  grade: '📖',
  semester: '📄',
  knowledge_point: '•',
}

const LEVEL_COLORS: Record<TreeNodeLevel, string> = {
  subject: '#5C9DFF',
  grade: '#A78BFA',
  semester: '#34D399',
  knowledge_point: '#FBBF24',
}

/* ===================================================================
   Sub-component: SidebarTreeView
   =================================================================== */

function SidebarTreeView(props: {
  tree: TreeNode[]
  expanded: Set<string>
  selected: string | null
  onToggle: (id: string) => void
  onSelect: (id: string) => void
  collapsed: boolean
  onToggleCollapse: () => void
}) {
  const { tree, expanded, selected, onToggle, onSelect, collapsed, onToggleCollapse } = props

  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-3 py-4" style={{ backgroundColor: '#1C2332', width: 48 }}>
        <button
          type="button"
          className="rounded-[8px] p-1.5 text-[#8A94A9] hover:text-[#E8ECF3] hover:bg-white/[0.06] transition"
          onClick={onToggleCollapse}
          title="展开学科树"
        >
          <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
        {tree.map((n) => (
          <button
            key={n.id}
            type="button"
            className={`rounded-[8px] p-1.5 text-base transition ${
              selected === n.id || selected?.startsWith(n.id)
                ? 'bg-[#2584FF]/20 text-[#5C9DFF]'
                : 'text-[#8A94A9] hover:text-[#E8ECF3] hover:bg-white/[0.06]'
            }`}
            onClick={() => { onSelect(n.id); onToggle(n.id) }}
            title={n.label}
          >
            {LEVEL_ICONS[n.level]}
          </button>
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: '#1C2332' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-3 border-b border-white/[0.06] shrink-0">
        <span className="text-sm font-semibold text-[#E8ECF3]">学科导航</span>
        <button
          type="button"
          className="rounded-[6px] p-1 text-[#8A94A9] hover:text-[#E8ECF3] hover:bg-white/[0.06] transition"
          onClick={onToggleCollapse}
          title="收起侧边栏"
        >
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
      </div>
      {/* Tree */}
      <div className="flex-1 overflow-y-auto py-2 px-1">
        {tree.map((subjectNode) => (
          <TreeNodeItem
            key={subjectNode.id}
            node={subjectNode}
            expanded={expanded}
            selected={selected}
            depth={0}
            onToggle={onToggle}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  )
}

function TreeNodeItem(props: {
  node: TreeNode
  expanded: Set<string>
  selected: string | null
  depth: number
  onToggle: (id: string) => void
  onSelect: (id: string) => void
}) {
  const { node, expanded, selected, depth, onToggle, onSelect } = props
  const hasChildren = node.children && node.children.length > 0
  const isExpanded = expanded.has(node.id)
  const isSelected = selected === node.id
  const isInPath = selected?.startsWith(node.id + '-') ?? false
  const isSubject = node.level === 'subject'

  return (
    <div>
      <button
        type="button"
        className={`w-full flex items-center gap-1.5 rounded-[6px] px-2 py-1.5 text-left text-sm transition cursor-pointer
          ${isSelected || isInPath
            ? 'bg-[#2584FF]/10 text-[#5C9DFF]'
            : 'text-[#C8CFDF] hover:bg-white/[0.04] hover:text-[#E8ECF3]'
          }
          ${isSubject ? 'font-semibold' : 'font-normal'}
        `}
        style={{ paddingLeft: `${depth * 16 + 8}px`, color: isSelected || isInPath ? LEVEL_COLORS[node.level] : undefined }}
        onClick={() => {
          onSelect(node.id)
          if (hasChildren) onToggle(node.id)
        }}
      >
        {/* Expand / Collapse arrow */}
        {hasChildren ? (
          <svg
            width={14}
            height={14}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        ) : (
          <span className="w-[14px] shrink-0 text-center text-[10px]">{LEVEL_ICONS[node.level]}</span>
        )}
        {/* Icon & Label */}
        {hasChildren && <span className="text-xs shrink-0">{LEVEL_ICONS[node.level]}</span>}
        <span className="truncate">{node.label}</span>
      </button>
      {/* Children */}
      {hasChildren && isExpanded && (
        <div>
          {node.children!.map((child) => (
            <TreeNodeItem
              key={child.id}
              node={child}
              expanded={expanded}
              selected={selected}
              depth={depth + 1}
              onToggle={onToggle}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/* ===================================================================
   Sub-component: SubjectTopicBar (学科标签 + 专题筛选 + 统计)
   =================================================================== */

function SubjectTopicBar(props: {
  stats: { subjectCounts: Record<string, number>; topicCounts: Record<string, Record<string, number>> } | null
  topics: Record<string, { topic: string; count: number }[]> | null
  selectedSubject: string
  selectedTopic: string
  onSubjectChange: (subject: string) => void
  onTopicChange: (topic: string) => void
}) {
  const { stats, topics, selectedSubject, selectedTopic, onSubjectChange, onTopicChange } = props

  const allSubjects = ['数学', '语文', '英语', '物理', '化学', '生物', '历史', '地理', '政治']

  if (!stats) {
    return (
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs text-[#6B7394]">加载统计中...</span>
      </div>
    )
  }

  const currentTopics = topics?.[selectedSubject] || []
  const hasData = Object.keys(stats.subjectCounts).length > 0

  return (
    <div className="mb-3 space-y-2">
      {/* 学科标签栏 */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[11px] text-[#6B7394] mr-1 shrink-0">学科：</span>
        <button
          type="button"
          className={`rounded-[8px] px-3 py-1 text-xs font-medium transition border ${
            !selectedSubject
              ? 'bg-[#2584FF] text-white border-[#2584FF]'
              : 'bg-white/[0.03] text-[#C8CFDF] border-white/[0.06] hover:bg-white/[0.06]'
          }`}
          onClick={() => onSubjectChange('')}
        >
          全部
          {hasData && <span className="ml-1 opacity-60">{Object.values(stats.subjectCounts).reduce((a, b) => a + b, 0)}</span>}
        </button>
        {allSubjects.map((subj) => {
          const count = stats.subjectCounts[subj] || 0
          const isActive = selectedSubject === subj
          return (
            <button
              key={subj}
              type="button"
              className={`rounded-[8px] px-3 py-1 text-xs font-medium transition border ${
                isActive
                  ? 'bg-[#2584FF]/15 text-[#5C9DFF] border-[#2584FF]/30'
                  : count > 0
                    ? 'bg-white/[0.03] text-[#C8CFDF] border-white/[0.06] hover:bg-white/[0.06]'
                    : 'bg-white/[0.01] text-[#6B7394] border-white/[0.03] opacity-50'
              }`}
              onClick={() => onSubjectChange(isActive ? '' : subj)}
            >
              {subj}
              {count > 0 && <span className={`ml-1 text-[10px] ${isActive ? 'text-[#5C9DFF]' : 'text-[#8A94A9]'}`}>{count}</span>}
            </button>
          )
        })}
      </div>

      {/* 专题筛选栏（仅当选中学科时显示） */}
      {selectedSubject && currentTopics.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-[11px] text-[#6B7394] mr-1 shrink-0">专题：</span>
          <button
            type="button"
            className={`rounded-[6px] px-2.5 py-0.5 text-[11px] transition border ${
              !selectedTopic
                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25'
                : 'bg-white/[0.02] text-[#8A94A9] border-white/[0.04] hover:bg-white/[0.04] hover:text-[#C8CFDF]'
            }`}
            onClick={() => onTopicChange('')}
          >
            全部专题
          </button>
          {currentTopics.map(({ topic, count }) => {
            const isActive = selectedTopic === topic
            return (
              <button
                key={topic}
                type="button"
                className={`rounded-[6px] px-2.5 py-0.5 text-[11px] transition border ${
                  isActive
                    ? 'bg-[#2584FF]/15 text-[#5C9DFF] border-[#2584FF]/30'
                    : 'bg-white/[0.02] text-[#8A94A9] border-white/[0.04] hover:bg-white/[0.04] hover:text-[#C8CFDF]'
                }`}
                onClick={() => onTopicChange(isActive ? '' : topic)}
              >
                {topic}
                <span className={`ml-1 opacity-70 ${isActive ? 'text-[#5C9DFF]' : ''}`}>{count}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ===================================================================
   Sub-component: ActivePathBar
   =================================================================== */

function ActivePathBar(props: { selected: string | null }) {
  const { selected } = props
  if (!selected) return null

  const { subject, grade, semester, knowledge_point } = parseNodeId(selected)
  const parts = [subject, grade, semester, knowledge_point].filter(Boolean)

  return (
    <div className="flex items-center gap-1.5 mb-4 text-xs">
      <span className="text-[#8A94A9]">当前位置：</span>
      {parts.map((part, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <span className="text-[#4A5266]">/</span>}
          <span className={`px-2 py-0.5 rounded-[6px] font-medium ${
            i === parts.length - 1
              ? 'bg-[#2584FF]/15 text-[#5C9DFF]'
              : 'bg-white/[0.04] text-[#8A94A9]'
          }`}>
            {part}
          </span>
        </span>
      ))}
    </div>
  )
}

/* ===================================================================
   Sub-component: FilterChips
   =================================================================== */

function FilterChips(props: {
  chips: ActiveTag[]
  onClearAll?: () => void
}) {
  const { chips, onClearAll } = props
  if (chips.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-1.5 mb-3">
      {chips.map((chip) => (
        <span
          key={chip.id}
          className="inline-flex items-center gap-1 rounded-[6px] bg-[#2584FF]/10 px-2 py-0.5 text-xs text-[#5C9DFF] border border-[#2584FF]/20"
        >
          {chip.label}
          <button
            type="button"
            className="rounded-full p-0.5 hover:bg-[#2584FF]/20 transition"
            onClick={chip.onRemove}
            title="移除"
          >
            <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round">
              <line x1={18} y1={6} x2={6} y2={18} />
              <line x1={6} y1={6} x2={18} y2={18} />
            </svg>
          </button>
        </span>
      ))}
      {chips.length > 1 && onClearAll && (
        <button
          type="button"
          className="text-xs text-[#8A94A9] hover:text-[#E8ECF3] underline"
          onClick={onClearAll}
        >
          清除全部
        </button>
      )}
    </div>
  )
}

/* ===================================================================
   Sub-component: QuestionCard
   =================================================================== */

function QuestionCard(props: {
  question: BankQuestion
  index: number
  isPublicTab: boolean
  selected: boolean
  onToggleSelect: () => void
  onEdit: () => void
  onDelete: () => void
  onAddToBasket: () => void
  inBasket: boolean
  onTagClick: (tag: string) => void
}) {
  const { question: q, index, isPublicTab, selected, onToggleSelect, onEdit, onDelete, onAddToBasket, inBasket, onTagClick } = props

  const difficultyColors: Record<string, string> = {
    '基础': 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
    '中等': 'bg-amber-500/15 text-amber-400 border-amber-500/25',
    '拔高': 'bg-red-500/15 text-red-400 border-red-500/25',
  }

  return (
    <div
      className="rounded-[12px] border border-white/[0.06] p-4 transition-all hover:border-[#2584FF]/20 hover:bg-[#1E273B]"
      style={{ backgroundColor: selected ? 'rgba(37,132,255,0.06)' : '#1C2332' }}
    >
      {/* Header: number, type, difficulty, source */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={selected}
              onChange={onToggleSelect}
              className="rounded border-white/20 bg-transparent accent-[#2584FF]"
            />
            <span className="text-[#5C9DFF] font-semibold text-sm">题号 {String(index).padStart(2, '0')}</span>
          </label>
          <span className="rounded-[6px] bg-white/[0.04] px-2 py-0.5 text-xs text-[#8A94A9] border border-white/[0.06]">
            {q.question_type}
          </span>
          <span className={`rounded-[6px] px-2 py-0.5 text-xs border ${difficultyColors[q.difficulty] || 'bg-white/[0.04] text-[#8A94A9] border-white/[0.06]'}`}>
            {q.difficulty}
          </span>
          <span className="text-xs text-[#C8CFDF] ml-1">{q.source}</span>
        </div>
        <span className="text-[10px] text-[#6B7394]">
          {q.created_at ? new Date(q.created_at).toLocaleDateString('zh-CN') : ''}
        </span>
      </div>

      {/* Question Content */}
      <div className="mb-3 text-sm leading-relaxed text-[#E8ECF3]">
        <MathRenderer text={q.content} className="text-sm leading-relaxed" />
      </div>

      {/* Options - 2x2 grid for choice questions */}
      {q.options && q.options.length > 0 && (
        <div className="mb-3 grid grid-cols-2 gap-2 text-sm">
          {q.options.map((opt: string, oi: number) => {
            const letters = ['A. ', 'B. ', 'C. ', 'D. ', 'E. ', 'F. ']
            return (
              <div
                key={oi}
                className="rounded-[8px] bg-white/[0.03] border border-white/[0.04] px-3 py-2"
              >
                <span className="font-semibold text-[#5C9DFF] mr-1">{letters[oi] || `${oi + 1}. `}</span>
                <MathRenderer text={opt} className="inline" />
              </div>
            )
          })}
        </div>
      )}

      {/* Answer & Analysis */}
      <div className="mb-3 space-y-2 rounded-[8px] bg-white/[0.02] p-3 text-xs">
        <div className="flex items-start gap-2">
          <span className="font-semibold text-emerald-400 shrink-0 mt-0.5">答案：</span>
          <span className="text-[#C8CFDF]">
            <MathRenderer text={q.answer} className="inline" />
          </span>
        </div>
        {q.analysis && q.analysis !== '暂无' && (
          <div className="flex items-start gap-2">
            <span className="font-semibold text-[#5C9DFF] shrink-0 mt-0.5">解析：</span>
            <span className="text-[#8A94A9]">
              <MathRenderer text={q.analysis} className="inline" />
            </span>
          </div>
        )}
        {q.knowledge_point && (
          <div className="flex items-start gap-2">
            <span className="font-semibold text-[#6B7394] shrink-0 mt-0.5">知识点：</span>
            <span className="text-[#6B7394]">{q.knowledge_point}</span>
          </div>
        )}
      </div>

      {/* Tags */}
      {q.tags && q.tags.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {q.tags.map((tag: string, i: number) => (
            <button
              key={i}
              type="button"
              className="rounded-[6px] bg-[#2584FF]/8 px-2 py-0.5 text-[11px] text-[#5C9DFF] border border-[#2584FF]/12 hover:bg-[#2584FF]/16 transition cursor-pointer"
              onClick={() => onTagClick(tag)}
              title="点击筛选此标签"
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex items-center gap-2 pt-2 border-t border-white/[0.04]">
        {!isPublicTab && (
          <>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-[6px] bg-white/[0.04] px-3 py-1.5 text-xs text-[#C8CFDF] border border-white/[0.06] hover:bg-white/[0.08] hover:text-[#E8ECF3] transition"
              onClick={onEdit}
            >
              <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
              编辑
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-[6px] bg-red-500/8 px-3 py-1.5 text-xs text-red-400 border border-red-500/12 hover:bg-red-500/16 transition"
              onClick={onDelete}
            >
              <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
              删除
            </button>
          </>
        )}
        {isPublicTab && (
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-[6px] bg-white/[0.04] px-3 py-1.5 text-xs text-[#C8CFDF] border border-white/[0.06] hover:bg-white/[0.08] transition"
            onClick={onEdit}
          >
            <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            查看
          </button>
        )}
        <div className="flex-1" />
        <button
          type="button"
          className={`inline-flex items-center gap-1 rounded-[6px] px-3 py-1.5 text-xs border transition ${
            inBasket
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25'
              : 'bg-white/[0.04] text-[#C8CFDF] border-white/[0.06] hover:bg-white/[0.08] hover:text-[#E8ECF3]'
          }`}
          onClick={onAddToBasket}
        >
          <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <circle cx={9} cy={21} r={1} /><circle cx={20} cy={21} r={1} />
            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
          </svg>
          {inBasket ? '已加入试卷筐' : '加入试卷筐'}
        </button>
      </div>
    </div>
  )
}

/* ===================================================================
   Sub-component: EditQuestionModal
   =================================================================== */

function EditQuestionModal(props: {
  editing: BankQuestion
  setEditing: (q: BankQuestion) => void
  onSave: () => void
  onClose: () => void
  isPublicTab: boolean
  editingMode: 'edit' | 'view'
}) {
  const { editing, setEditing, onSave, onClose, isPublicTab, editingMode } = props
  const readonly = editingMode === 'view'
  const [showGeoboard, setShowGeoboard] = useState(false)

  const subjectTypes = SUBJECT_QUESTION_TYPES[editing.subject] || ALL_QUESTION_TYPES

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/[0.08] p-6 shadow-2xl"
        style={{ backgroundColor: '#121722' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-5 text-lg font-semibold text-[#E8ECF3] flex items-center gap-2">
          {editing.id
            ? (readonly ? '查看题目' : '编辑题目')
            : '添加题目'}
          {editing.id && <span className="text-xs text-[#8A94A9] font-normal">ID: {editing.id.slice(0, 8)}</span>}
        </h3>

        <div className="space-y-3">
          {/* Subject + Grade + Type + Difficulty */}
          <div className="grid grid-cols-2 gap-3">
            <select
              className={inputClass}
              value={editing.subject}
              onChange={(e) => setEditing({ ...editing, subject: e.target.value, question_type: '' })}
              disabled={readonly}
            >
              {TEACHER_SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select
              className={inputClass}
              value={editing.grade}
              onChange={(e) => setEditing({ ...editing, grade: e.target.value })}
              disabled={readonly}
            >
              {TEACHER_GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
            <select
              className={inputClass}
              value={editing.question_type}
              onChange={(e) => setEditing({ ...editing, question_type: e.target.value })}
              disabled={readonly}
            >
              {subjectTypes.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <select
              className={inputClass}
              value={editing.difficulty}
              onChange={(e) => setEditing({ ...editing, difficulty: e.target.value })}
              disabled={readonly}
            >
              {DIFFICULTIES.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>

          {/* 元数据 + 知识点树 */}
          <QuestionMetadataFields
            draft={editing}
            disabled={readonly}
            onChange={(patch) => setEditing({ ...editing, ...patch })}
          />

          {/* Content with LaTeX Editor */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-[#8A94A9]">题目内容</label>
              {!readonly && (
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-[6px] border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 text-[11px] text-[#5C9DFF] hover:bg-[#2584FF]/10 transition"
                  onClick={() => setShowGeoboard(true)}
                >
                  <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <rect x={3} y={3} width={18} height={18} rx={2} ry={2} />
                    <circle cx={8.5} cy={8.5} r={1.5} />
                    <polyline points="21 15 16 10 5 21" />
                  </svg>
                  几何板
                </button>
              )}
            </div>
            {readonly ? (
              <div className="rounded-[8px] border border-white/[0.06] bg-[#1C2332] p-3 min-h-[80px]">
                <MathRenderer text={editing.content} className="text-sm leading-relaxed" />
              </div>
            ) : (
              <LatexFormulaEditor
                value={editing.content}
                onChange={(value: string) => setEditing({ ...editing, content: value })}
                placeholder="题目内容（支持 LaTeX: $...$ 行内公式, $$...$$ 独立公式）"
                className="min-h-[120px]"
              />
            )}
          </div>

          {/* Content Preview (LaTeX rendering) */}
          {!readonly && (
            <div>
              <label className="mb-1 block text-xs text-[#8A94A9]">内容预览（公式渲染）</label>
              <div className="rounded-[8px] border border-white/[0.06] bg-[#1C2332] p-3 min-h-[40px]">
                <MathRenderer text={editing.content} className="text-sm leading-relaxed" />
              </div>
            </div>
          )}

          {/* Options */}
          <div>
            <label className="mb-1 block text-xs text-[#8A94A9]">选项（每行一个）</label>
            {readonly ? (
              <div className="space-y-1">
                {editing.options.map((opt, i) => (
                  <div key={i} className="rounded-[6px] bg-[#1C2332] border border-white/[0.04] px-3 py-1.5 text-xs text-[#C8CFDF]">
                    <MathRenderer text={opt} />
                  </div>
                ))}
              </div>
            ) : (
              <LatexFormulaEditor
                value={editing.options.join('\n')}
                onChange={(text) => setEditing({ ...editing, options: text.split('\n') })}
                placeholder="A. 选项A（每行一个，支持 LaTeX）"
              />
            )}
          </div>

          {/* Answer */}
          <div>
            <label className="mb-1 block text-xs text-[#8A94A9]">正确答案（支持 LaTeX）</label>
            {readonly ? (
              <div className="rounded-[8px] border border-white/[0.06] bg-[#1C2332] p-3">
                <span className="text-emerald-400 text-sm"><MathRenderer text={editing.answer} /></span>
              </div>
            ) : (
              <LatexFormulaEditor
                value={editing.answer}
                onChange={(value: string) => setEditing({ ...editing, answer: value })}
                placeholder="正确答案（支持 LaTeX）"
              />
            )}
          </div>

          {/* Analysis — Markdown/LaTeX 纯文本 */}
          <div>
            <label className="mb-1 block text-xs text-[#8A94A9]">解析（Markdown/LaTeX，块级公式用 $$...$$）</label>
            {readonly ? (
              <div className="rounded-[8px] border border-white/[0.06] bg-[#1C2332] p-3">
                <MathRenderer text={editing.analysis} className="text-sm text-[#5C9DFF]" />
              </div>
            ) : (
              <>
                <LatexFormulaEditor
                  value={editing.analysis}
                  onChange={(value: string) => setEditing({ ...editing, analysis: sanitizeAnalysisText(value) })}
                  placeholder="解析：支持 $行内$ 与 $$块级$$ 公式"
                />
                {editing.analysis && (
                  <div className="mt-2 rounded-[8px] border border-white/[0.06] bg-[#0f1419] p-3">
                    <p className="mb-1 text-[10px] text-[#6B7394]">KaTeX 预览</p>
                    <MathRenderer text={editing.analysis} className="text-sm text-[#5C9DFF]" />
                  </div>
                )}
              </>
            )}
          </div>

          {/* Tags */}
          <div>
            <label className="mb-1 block text-xs text-[#8A94A9]">标签（逗号分隔）</label>
            <input
              className={inputClass}
              placeholder="中考真题, 上海, 力学"
              value={editing.tags.join(',')}
              onChange={(e) => setEditing({ ...editing, tags: e.target.value.split(',').map((t: string) => t.trim()).filter(Boolean) })}
              disabled={readonly}
            />
          </div>

          {/* Visibility */}
          {!readonly && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-[#8A94A9]">可见性：</span>
              <select
                className={`${inputClass} w-auto`}
                value={editing.visibility || 'personal'}
                onChange={(e) => setEditing({ ...editing, visibility: e.target.value as 'personal' | 'public' })}
              >
                <option value="personal">个人题库</option>
                <option value="public">公域题库</option>
              </select>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className={btnSecondary} onClick={onClose}>
            {readonly ? '关闭' : '取消'}
          </button>
          {!readonly && (
            <button type="button" className={btnPrimary} onClick={onSave}>
              保存题目
            </button>
          )}
        </div>

        {/* Geometry Board Modal */}
        {showGeoboard && !readonly && (
          <GeometryBoard
            onSave={(base64: string) => {
              setEditing({ ...editing, content: editing.content + `\n![几何图](${base64})` })
              setShowGeoboard(false)
            }}
            onClose={() => setShowGeoboard(false)}
          />
        )}
      </div>
    </div>
  )
}

/* ===================================================================
   Main Page Component: TeacherQuestionBankPage
   =================================================================== */

export default function TeacherQuestionBankPage() {
  const { profile } = useAuth()
  const teacherId = profile?.id ?? ''

  // Data
  const [items, setItems] = useState<BankQuestion[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [selected, setSelected] = useState<string[]>([])

  // Filters
  const [filters, setFilters] = useState({
    subject: '',
    grade: '',
    question_type: '',
    difficulty: '',
    source: '',
    keyword: '',
    visibility: 'personal' as 'personal' | 'public',
    knowledge_point: '',
  })

  // Tree state
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set())
  const [selectedTreeNode, setSelectedTreeNode] = useState<string | null>(null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  // Tag chips from filters
  const [activeFilterTags, setActiveFilterTags] = useState<string[]>([])

  // Edit modal
  const [editing, setEditing] = useState<BankQuestion | null>(null)

  // Decompose / Import
  const [splitPreview, setSplitPreview] = useState<Partial<BankQuestion>[] | null>(null)
  const [importing, setImporting] = useState(false)

  // Exam basket
  const [examBasket, setExamBasket] = useState<string[]>([])

  // Subject/Topic quick filter
  const [subjectTopics, setSubjectTopics] = useState<Record<string, { topic: string; count: number }[]> | null>(null)
  const [questionStats, setQuestionStats] = useState<{ subjectCounts: Record<string, number>; topicCounts: Record<string, Record<string, number>> } | null>(null)
  const [quickTopicTag, setQuickTopicTag] = useState('')

  // Scroll to top on filter/page change
  const mainRef = useRef<HTMLDivElement>(null)

  // Question types based on current filter subject
  const questionTypes = filters.subject
    ? (SUBJECT_QUESTION_TYPES[filters.subject] || ALL_QUESTION_TYPES)
    : ALL_QUESTION_TYPES

  /* ---- Load data ---- */
  const load = useCallback(async () => {
    if (!teacherId) return
    setLoading(true)
    try {
      const apiFilters: Record<string, string | number> = {
        page,
        pageSize: 10,
        visibility: filters.visibility,
      }
      if (filters.subject) apiFilters.subject = filters.subject
      if (filters.grade) apiFilters.grade = filters.grade
      if (filters.question_type) apiFilters.question_type = filters.question_type
      if (filters.difficulty) apiFilters.difficulty = filters.difficulty
      if (filters.source) apiFilters.source = filters.source
      if (filters.keyword) apiFilters.keyword = filters.keyword
      if (filters.knowledge_point) apiFilters.knowledge_point = filters.knowledge_point

      const data = await fetchQuestions(teacherId, apiFilters)
      setItems(data.items)
      setTotal(data.total)
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [teacherId, filters, page])

  useEffect(() => {
    load()
  }, [load])

  /* ---- Load topics & stats ---- */
  useEffect(() => {
    if (!teacherId) return
    let cancelled = false
    Promise.all([
      fetchTopics(teacherId).catch(() => null),
      fetchQuestionStats(teacherId).catch(() => null),
    ]).then(([topics, stats]) => {
      if (cancelled) return
      setSubjectTopics(topics)
      setQuestionStats(stats)
    })
    return () => { cancelled = true }
  }, [teacherId])

  /* ---- Quick subject/topic handlers ---- */
  const handleQuickSubject = useCallback((subject: string) => {
    setFilters((f) => ({ ...f, subject, knowledge_point: '', grade: '' }))
    setQuickTopicTag('')
    setSelectedTreeNode(null)
    setPage(1)
  }, [])

  const handleQuickTopic = useCallback((topic: string) => {
    setQuickTopicTag(topic)
    setFilters((f) => ({ ...f, knowledge_point: topic }))
    setPage(1)
  }, [])

  /* ---- Build active tags from filters ---- */
  const activeTagChips = useMemo((): ActiveTag[] => {
    const chips: ActiveTag[] = []
    if (filters.subject) {
      chips.push({
        id: 'tag-subject',
        label: filters.subject,
        type: 'subject',
        onRemove: () => { setFilters((f) => ({ ...f, subject: '', knowledge_point: '' })); setSelectedTreeNode(null); setPage(1) },
      })
    }
    if (filters.grade) {
      chips.push({
        id: 'tag-grade',
        label: filters.grade,
        type: 'grade',
        onRemove: () => { setFilters((f) => ({ ...f, grade: '', knowledge_point: '' })); setPage(1) },
      })
    }
    if (filters.knowledge_point) {
      chips.push({
        id: 'tag-kp',
        label: filters.knowledge_point,
        type: 'knowledge_point',
        onRemove: () => { setFilters((f) => ({ ...f, knowledge_point: '' })); setPage(1) },
      })
    }
    if (filters.question_type) {
      chips.push({
        id: 'tag-type',
        label: filters.question_type,
        type: 'question_type',
        onRemove: () => { setFilters((f) => ({ ...f, question_type: '' })); setPage(1) },
      })
    }
    if (filters.difficulty) {
      chips.push({
        id: 'tag-diff',
        label: filters.difficulty,
        type: 'difficulty',
        onRemove: () => { setFilters((f) => ({ ...f, difficulty: '' })); setPage(1) },
      })
    }
    if (filters.source) {
      chips.push({
        id: 'tag-source',
        label: filters.source,
        type: 'source',
        onRemove: () => { setFilters((f) => ({ ...f, source: '' })); setPage(1) },
      })
    }
    // Additional tag-based chips
    activeFilterTags.forEach((tag) => {
      chips.push({
        id: `tag-ft-${tag}`,
        label: tag,
        type: 'custom',
        onRemove: () => setActiveFilterTags((t) => t.filter((x) => x !== tag)),
      })
    })
    return chips
  }, [filters, activeFilterTags])

  /* ---- Tree handlers ---- */
  const handleTreeToggle = useCallback((id: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const handleTreeSelect = useCallback((nodeId: string) => {
    setSelectedTreeNode(nodeId)
    const path = parseNodeId(nodeId)
    setFilters((f) => ({
      ...f,
      subject: path.subject || f.subject,
      grade: path.grade || f.grade,
      knowledge_point: path.knowledge_point || '',
    }))
    setQuickTopicTag('')
    setPage(1)
  }, [])

  /* ---- Tag click from question card ---- */
  const handleTagClick = useCallback((tag: string) => {
    setActiveFilterTags((prev) => {
      if (prev.includes(tag)) return prev
      return [...prev, tag]
    })
    setPage(1)
  }, [])

  /* ---- Clear all filters ---- */
  const handleClearAll = useCallback(() => {
    setFilters({
      subject: '',
      grade: '',
      question_type: '',
      difficulty: '',
      source: '',
      keyword: '',
      visibility: filters.visibility,
      knowledge_point: '',
    })
    setActiveFilterTags([])
    setSelectedTreeNode(null)
    setQuickTopicTag('')
    setPage(1)
  }, [filters.visibility])

  /* ---- CRUD handlers ---- */
  const handleSave = async () => {
    if (!editing || !teacherId) return
    try {
      const payload: BankQuestion = {
        ...editing,
        analysis: sanitizeAnalysisText(editing.analysis),
        knowledge_point: editing.knowledge_point
          || knowledgeIdsToLegacyString(editing.knowledge_point_ids ?? []),
        knowledge_point_ids: editing.knowledge_point_ids ?? [],
      }
      if (payload.id) await updateQuestion(teacherId, payload.id, payload)
      else await createQuestion(teacherId, payload)
      setEditing(null)
      setMessage('保存成功')
      load()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '保存失败')
    }
  }

  const handleDeleteOne = async (id: string) => {
    if (!teacherId || !id) return
    try {
      await deleteQuestions(teacherId, [id])
      setMessage('已删除')
      load()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '删除失败')
    }
  }

  const handleBatchDelete = async () => {
    if (!teacherId || selected.length === 0) return
    try {
      await deleteQuestions(teacherId, selected)
      setSelected([])
      setMessage(`已删除 ${selected.length} 道题目`)
      load()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '批量删除失败')
    }
  }

  const handleBatchTagUpdate = async () => {
    if (!teacherId || selected.length === 0) return
    const tag = prompt('输入标签（逗号分隔）')
    if (!tag) return
    try {
      await batchUpdateTags(teacherId, selected, tag.split(',').map((t) => t.trim()))
      setSelected([])
      setMessage('标签已更新')
      load()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '更新失败')
    }
  }

  const handleVisibilityChange = async (ids: string[], vis: 'personal' | 'public') => {
    if (!teacherId) return
    try {
      await batchUpdateVisibility(teacherId, ids, vis)
      setSelected([])
      setMessage(vis === 'public' ? '已移至公域题库' : '已移至个人题库')
      load()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '操作失败')
    }
  }

  const handleImportFile = async (file: File) => {
    if (!teacherId) return
    setImporting(true)
    setMessage(null)
    try {
      const prepared = await prepareExamFileForDecompose(file)
      if (prepared.convertedFromPdf) {
        setMessage('检测到扫描版 PDF，已自动转为图片进行 OCR 拆题…')
      }
      const result = await submitDecomposeTask(
        teacherId,
        prepared.base64,
        prepared.fileName,
        filters.subject || '物理',
        filters.grade || '八年级',
      )
      if (!result.success) {
        throw new Error(result.message || '提交拆题任务失败')
      }
      setMessage('任务已提交，正在后台处理，可稍后查看')
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '提交失败')
    } finally {
      setImporting(false)
    }
  }

  const confirmImport = async () => {
    if (!splitPreview || !teacherId) return
    try {
      await batchImportQuestions(teacherId, splitPreview)
      setSplitPreview(null)
      setMessage('批量入库成功')
      load()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '入库失败')
    }
  }

  /* ---- Toggle question selection ---- */
  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }, [])

  /* ---- Exam basket ---- */
  const toggleBasket = useCallback((id: string) => {
    setExamBasket((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }, [])

  /* ---- Derived values ---- */
  const pageCount = Math.max(1, Math.ceil(total / 10))
  const isPublicTab = filters.visibility === 'public'
  const hasFilters = !!(filters.subject || filters.grade || filters.question_type || filters.difficulty || filters.source || filters.keyword || filters.knowledge_point || activeFilterTags.length > 0)

  return (
    <div className="min-h-screen text-[#E8ECF3]" style={{ backgroundColor: '#121722' }}>
      <DashboardHeader title="我的题库" backTo="/teacher/dashboard" backLabel="返回工作台" featureNavRole="teacher" />

      {/* Main layout: sidebar + content */}
      <div className="flex" style={{ height: 'calc(100vh - 56px)' }}>
        {/* ---- LEFT SIDEBAR ---- */}
        <div
          className="shrink-0 border-r border-white/[0.06] overflow-hidden transition-all duration-200"
          style={{ width: sidebarCollapsed ? 48 : 260 }}
        >
          <SidebarTreeView
            tree={SUBJECT_TREE}
            expanded={expandedNodes}
            selected={selectedTreeNode}
            onToggle={handleTreeToggle}
            onSelect={handleTreeSelect}
            collapsed={sidebarCollapsed}
            onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
          />
        </div>

        {/* ---- RIGHT CONTENT ---- */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Top bar: tabs + actions */}
          <div className="shrink-0 px-5 pt-4 pb-2 flex items-center justify-between gap-3 border-b border-white/[0.04] flex-wrap"
            style={{ backgroundColor: '#121722' }}
          >
            {/* Tabs */}
            <div className="flex items-center gap-1 rounded-[10px] p-1" style={{ backgroundColor: '#1C2332' }}>
              <button
                type="button"
                className={`rounded-[8px] px-4 py-2 text-sm font-medium transition ${
                  !isPublicTab ? 'bg-[#2584FF] text-white shadow' : 'text-[#8A94A9] hover:text-[#E8ECF3]'
                }`}
                onClick={() => { setFilters({ ...filters, visibility: 'personal', subject: '', grade: '', knowledge_point: '' }); setPage(1); setSelected([]); setSelectedTreeNode(null); setActiveFilterTags([]); setQuickTopicTag('') }}
              >
                我的题库
              </button>
              <button
                type="button"
                className={`rounded-[8px] px-4 py-2 text-sm font-medium transition ${
                  isPublicTab ? 'bg-emerald-600 text-white shadow' : 'text-[#8A94A9] hover:text-[#E8ECF3]'
                }`}
                onClick={() => { setFilters({ ...filters, visibility: 'public', subject: '', grade: '', knowledge_point: '' }); setPage(1); setSelected([]); setSelectedTreeNode(null); setActiveFilterTags([]); setQuickTopicTag('') }}
              >
                公域题库
              </button>
            </div>

            {/* Exam basket indicator */}
            {examBasket.length > 0 && (
              <Link
                to="/teacher/exam-builder"
                className="inline-flex items-center gap-1.5 rounded-[8px] bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/16 transition"
              >
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <circle cx={9} cy={21} r={1} /><circle cx={20} cy={21} r={1} />
                  <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
                </svg>
                试卷筐 ({examBasket.length})
              </Link>
            )}
          </div>

          {/* Sub-header: filters + actions */}
          <div className="shrink-0 px-5 py-2 flex items-center gap-2 flex-wrap border-b border-white/[0.04]"
            style={{ backgroundColor: '#121722' }}
          >
            {/* Dropdown filters */}
            <select
              className={`${selectClass} w-[100px]`}
              value={filters.question_type}
              onChange={(e) => { setFilters((f) => ({ ...f, question_type: e.target.value })); setPage(1) }}
              style={{ backgroundColor: '#1C2332', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '6px 28px 6px 10px', color: '#E8ECF3', fontSize: 12, outline: 'none' }}
            >
              <option value="">题型</option>
              {questionTypes.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <select
              className={`${selectClass} w-[100px]`}
              value={filters.difficulty}
              onChange={(e) => { setFilters((f) => ({ ...f, difficulty: e.target.value })); setPage(1) }}
              style={{ backgroundColor: '#1C2332', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '6px 28px 6px 10px', color: '#E8ECF3', fontSize: 12, outline: 'none' }}
            >
              <option value="">难度</option>
              {DIFFICULTIES.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            <select
              className={`${selectClass} w-[100px]`}
              value={filters.source}
              onChange={(e) => { setFilters((f) => ({ ...f, source: e.target.value })); setPage(1) }}
              style={{ backgroundColor: '#1C2332', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '6px 28px 6px 10px', color: '#E8ECF3', fontSize: 12, outline: 'none' }}
            >
              <option value="">来源</option>
              {QUESTION_SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <input
              className="rounded-[8px] border border-white/[0.08] bg-[#1C2332] px-3 py-1.5 text-xs text-[#E8ECF3] placeholder-[#8A94A9] outline-none transition focus:border-[#2584FF]"
              style={{ width: 160 }}
              placeholder="搜索题目关键词…"
              value={filters.keyword}
              onChange={(e) => { setFilters((f) => ({ ...f, keyword: e.target.value })); setPage(1) }}
            />

            {/* Spacer */}
            <div className="flex-1" />

            {/* Action buttons */}
            {!isPublicTab && (
              <div className="flex items-center gap-2">
                <button type="button" className={btnPrimary} style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => setEditing(emptyQuestion())}>
                  单题录入
                </button>
                <label className={`${btnSecondary} cursor-pointer ${importing ? 'opacity-50 pointer-events-none' : ''}`} style={{ fontSize: 12, padding: '6px 12px' }}>
                  {importing ? '提交中…' : '上传拆题'}
                  <input type="file" accept=".docx,.pdf" className="hidden" onChange={(e) => e.target.files?.[0] && handleImportFile(e.target.files[0])} />
                </label>
                <Link to="/teacher/batch-upload" className={btnSecondary} style={{ fontSize: 12, padding: '6px 12px' }}>批量拆题</Link>
              </div>
            )}
          </div>

          {/* Active path + filter chips */}
          <div className="shrink-0 px-5 pt-3">
            <SubjectTopicBar
              stats={questionStats}
              topics={subjectTopics}
              selectedSubject={filters.subject}
              selectedTopic={quickTopicTag}
              onSubjectChange={handleQuickSubject}
              onTopicChange={handleQuickTopic}
            />
            <ActivePathBar selected={selectedTreeNode} />
            <FilterChips chips={activeTagChips} onClearAll={hasFilters ? handleClearAll : undefined} />
          </div>

          {/* Message toast */}
          {message && (
            <div className="shrink-0 px-5 mb-2">
              <p className="rounded-[8px] border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-sm text-blue-200">{message}</p>
            </div>
          )}

          {/* Batch operation bar */}
          {selected.length > 0 && (
            <div className="shrink-0 px-5 py-2 flex flex-wrap gap-2 border-b border-white/[0.04]">
              {!isPublicTab && (
                <>
                  <button type="button" className={btnSecondary} style={{ fontSize: 12 }} onClick={handleBatchDelete}>
                    批量删除 ({selected.length})
                  </button>
                  <button type="button" className={btnSecondary} style={{ fontSize: 12 }} onClick={handleBatchTagUpdate}>
                    批量改标签
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-[8px] border border-emerald-600/30 bg-transparent px-3 py-1.5 text-xs font-medium text-emerald-400 transition hover:bg-emerald-500/10"
                    onClick={() => handleVisibilityChange(selected, 'public')}
                  >
                    移至公域
                  </button>
                </>
              )}
              {isPublicTab && (
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-[8px] border border-amber-600/30 bg-transparent px-3 py-1.5 text-xs font-medium text-amber-400 transition hover:bg-amber-500/10"
                  onClick={() => handleVisibilityChange(selected, 'personal')}
                >
                  移至个人 ({selected.length})
                </button>
              )}
            </div>
          )}

          {/* Question list (scrollable) */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3" ref={mainRef}>
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <div className="flex items-center gap-2 text-[#8A94A9]">
                  <svg className="animate-spin" width={18} height={18} viewBox="0 0 24 24" fill="none">
                    <circle cx={12} cy={12} r={10} stroke="currentColor" strokeWidth={3} strokeDasharray="32" strokeLinecap="round" />
                  </svg>
                  加载中...
                </div>
              </div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <svg width={48} height={48} viewBox="0 0 24 24" fill="none" stroke="#8A94A9" strokeWidth={1} strokeLinecap="round" strokeLinejoin="round" className="mb-4 opacity-40">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1={16} y1={13} x2={8} y2={13} />
                  <line x1={16} y1={17} x2={8} y2={17} />
                  <polyline points="10 9 9 9 8 9" />
                </svg>
                <p className="text-[#8A94A9] mb-4">
                  {hasFilters ? '筛选条件下暂无题目' : (isPublicTab ? '公域题库暂无题目' : '暂无试题数据')}
                </p>
                {!isPublicTab && !hasFilters && (
                  <Link to="/teacher/batch-upload" className={btnPrimary}>去批量拆题</Link>
                )}
                {hasFilters && (
                  <button type="button" className={btnSecondary} onClick={handleClearAll}>
                    清除筛选
                  </button>
                )}
              </div>
            ) : (
              items.map((q, i) => (
                <QuestionCard
                  key={q.id}
                  question={q}
                  index={i + 1 + (page - 1) * 10}
                  isPublicTab={isPublicTab}
                  selected={selected.includes(q.id!)}
                  onToggleSelect={() => toggleSelect(q.id!)}
                  onEdit={() => setEditing(q)}
                  onDelete={() => handleDeleteOne(q.id!)}
                  onAddToBasket={() => toggleBasket(q.id!)}
                  inBasket={examBasket.includes(q.id!)}
                  onTagClick={handleTagClick}
                />
              ))
            )}
          </div>

          {/* Pagination */}
          <div className="shrink-0 px-5 py-3 flex items-center justify-between text-sm text-[#8A94A9] border-t border-white/[0.04]">
            <span>共 {total} 题</span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={page <= 1}
                className="rounded-[6px] border border-white/[0.08] bg-transparent px-3 py-1 text-xs text-[#C8CFDF] hover:bg-white/[0.04] disabled:opacity-30 disabled:cursor-not-allowed transition"
                onClick={() => setPage((p) => p - 1)}
              >
                上一页
              </button>
              <span className="text-xs">
                <span className="text-[#E8ECF3]">{page}</span>
                <span className="text-[#6B7394]"> / {pageCount}</span>
              </span>
              <button
                type="button"
                disabled={page >= pageCount}
                className="rounded-[6px] border border-white/[0.08] bg-transparent px-3 py-1 text-xs text-[#C8CFDF] hover:bg-white/[0.04] disabled:opacity-30 disabled:cursor-not-allowed transition"
                onClick={() => setPage((p) => p + 1)}
              >
                下一页
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ---- Edit Modal ---- */}
      {editing && (
        <EditQuestionModal
          editing={editing}
          setEditing={setEditing}
          onSave={handleSave}
          onClose={() => setEditing(null)}
          isPublicTab={isPublicTab}
          editingMode={isPublicTab ? 'view' : 'edit'}
        />
      )}

      {/* ---- Split Preview Modal ---- */}
      {splitPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setSplitPreview(null)}>
          <div
            className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-white/[0.08] p-6 shadow-2xl"
            style={{ backgroundColor: '#121722' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-4 text-lg font-semibold text-[#E8ECF3]">
              拆题结果确认（{splitPreview.length} 道）
            </h3>
            <div className="space-y-3">
              {splitPreview.map((q, i) => (
                <div key={i} className="rounded-[10px] border border-white/[0.06] p-4" style={{ backgroundColor: '#1C2332' }}>
                  <p className="text-xs text-[#8A94A9] mb-2">
                    {q.question_type} · {q.difficulty} · {q.knowledge_point || '未分类'}
                  </p>
                  {teacherId && (
                    <SplitQuestionEditor
                      question={q}
                      teacherId={teacherId}
                      onChange={(updated) => {
                        const next = [...splitPreview]
                        next[i] = updated
                        setSplitPreview(next)
                      }}
                    />
                  )}
                </div>
              ))}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className={btnSecondary} onClick={() => setSplitPreview(null)}>
                取消
              </button>
              <button type="button" className={btnPrimary} onClick={confirmImport}>
                确认入库
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
