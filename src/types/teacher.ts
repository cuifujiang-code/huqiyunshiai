export const TEACHER_SUBJECTS = ['语文', '数学', '英语', '物理', '化学', '生物', '历史', '地理'] as const
export const TEACHER_GRADES = ['七年级', '八年级', '九年级', '高一', '高二', '高三'] as const
export const DIFFICULTIES = ['基础', '中等', '拔高', '压轴'] as const
export const QUESTION_SOURCES = ['手动录入', '试卷导入', 'AI生成'] as const
export const QUESTION_SOURCE_EXAMPLES = [
  '手动录入',
  '试卷导入',
  'AI生成',
  '2024年高考数学全国卷I',
  '2025年高考数学全国卷II',
  '2026年高考全国2卷数学',
] as const
export const ABILITY_DIMENSIONS = [
  '逻辑推理',
  '运算求解',
  '直观想象',
  '数学建模',
  '数据分析',
] as const
export const SUITABLE_STAGES = [
  '高一同步',
  '高二同步',
  '高三一轮复习',
  '高三二轮复习',
  '高考冲刺',
  '竞赛培优',
] as const
export const TEXTBOOK_VERSIONS = [
  '人教版',
  '北师大版',
  '苏教版',
  '沪教版',
  '浙教版',
  '湘教版',
  '鲁教版',
] as const

/** 每科专属题型 */
export const SUBJECT_QUESTION_TYPES: Record<string, readonly string[]> = {
  '语文':   ['选择题', '填空题', '阅读理解', '文言文阅读', '古诗词鉴赏', '语言运用', '默写', '作文', '解答题'],
  '数学':   ['选择题', '填空题', '计算题', '证明题', '解答题', '应用题', '作图题'],
  '英语':   ['选择题', '完形填空', '阅读理解', '七选五', '语法填空', '短文改错', '书面表达', '听力'],
  '物理':   ['选择题', '填空题', '实验题', '计算题', '解答题', '作图题'],
  '化学':   ['选择题', '填空题', '实验题', '计算题', '推断题', '解答题'],
  '生物':   ['选择题', '填空题', '实验题', '解答题', '识图题'],
  '历史':   ['选择题', '材料分析题', '论述题', '解答题'],
  '地理':   ['选择题', '综合题', '解答题', '读图题'],
} as const

/** 全部科目+题型通用列表 */
export const ALL_QUESTION_TYPES = [
  '选择题', '填空题', '计算题', '证明题', '解答题', '应用题', '实验题',
  '作图题', '识图题', '推断题',
  '阅读理解', '文言文阅读', '古诗词鉴赏', '语言运用', '默写', '作文',
  '完形填空', '七选五', '语法填空', '短文改错', '书面表达', '听力',
  '材料分析题', '论述题', '综合题', '读图题',
] as const

/** 旧版兼容 */
export const QUESTION_TYPES = ALL_QUESTION_TYPES

export type TeacherSubject = (typeof TEACHER_SUBJECTS)[number]
export type TeacherGrade = (typeof TEACHER_GRADES)[number]
export type QuestionType = (typeof ALL_QUESTION_TYPES)[number]
export type QuestionDifficulty = (typeof DIFFICULTIES)[number]
export type QuestionSource = (typeof QUESTION_SOURCES)[number]

export interface QuestionVersion {
  id: string
  question_id: string
  version_number: number
  content: string
  answer: string
  analysis: string
  editor_id: string
  created_at: string
}

export interface QuestionStats {
  question_id: string
  total_attempts: number
  error_rate: number | null
  avg_score_rate: number | null
  common_errors: { option?: string; answer?: string; count: number }[]
  updated_at?: string
}

export interface BankQuestion {
  id?: string
  teacher_id?: string
  subject: string
  grade: string
  knowledge_point: string
  /** 关联 knowledge_points 表 UUID 数组 */
  knowledge_point_ids?: string[]
  question_type: QuestionType | string
  difficulty: QuestionDifficulty | string
  content: string
  options: string[]
  answer: string
  /** Markdown/LaTeX 纯文本解析，支持 $...$ 与 $$...$$ */
  analysis: string
  source: QuestionSource | string
  ability_dimension?: string
  suitable_stage?: string
  textbook_version?: string
  estimated_time?: number
  tags: string[]
  visibility?: 'personal' | 'public'
  stats?: QuestionStats | null
  created_at?: string
  updated_at?: string
}

export interface LessonPlan {
  id?: string
  teacher_id?: string
  title: string
  objectives: string
  question_ids: string[]
  created_at?: string
  updated_at?: string
}

export interface ExamTypeRow {
  question_type: QuestionType | string
  count: number
  scorePerQuestion: number
  difficultyMix: [number, number, number]
}

export interface BuiltExamSection {
  question_type: string
  questions: (BankQuestion & { number?: number; score?: number })[]
}

export interface BuiltExam {
  title: string
  subject: string
  grade: string
  totalScore: number
  sections: BuiltExamSection[]
  generatedAt: string
}

export type HandoutMode = 'school' | 'tutoring' | 'targeted' | 'custom'

export type HandoutModuleType = 'knowledge' | 'example' | 'exercise' | 'summary' | 'custom'

export interface HandoutModuleStyle {
  fontSize?: number
  color?: string
  fontFamily?: string
  /** 对应 OCR 原图页码（0-based），用于原件对比联动 */
  sourcePageIndex?: number
  /** 块宽度 */
  width?: 'full' | 'half'
  /** 水平对齐 */
  align?: 'left' | 'center' | 'right'
  /** 块上间距 px */
  marginTop?: number
}

export interface HandoutModule {
  id: string
  type?: HandoutModuleType
  title: string
  content: string
  items?: string[]
  style?: HandoutModuleStyle
  /** 例题/练习缺少答案 */
  missingAnswer?: boolean
  answer?: string
}

export interface HandoutCover {
  title: string
  subtitle?: string
  teacherName?: string
  date?: string
}

export type ExportMode = 'print' | 'digital'

export interface HandoutContent {
  title: string
  cover?: HandoutCover
  modules: HandoutModule[]
  headerText?: string
  footerText?: string
  exportMode?: ExportMode
  ocrMeta?: { source?: string; importedAt?: string }
}

export interface HandoutRecord {
  id?: string
  teacher_id?: string
  title: string
  mode: HandoutMode
  content: HandoutContent
  student_id?: string
  created_at?: string
  updated_at?: string
}

export interface BookBlock {
  id: string
  type: 'knowledge' | 'example' | 'exercise' | 'summary'
  title: string
  content: string
  questionId?: string
  missingAnswer?: boolean
  style?: HandoutModuleStyle
}

export interface BookSection {
  id: string
  title: string
  blocks: BookBlock[]
}

export interface BookChapter {
  id: string
  title: string
  sections: BookSection[]
}

export type BookCoverStyle = 'minimal' | 'academic' | 'fresh'

export type BookLayoutTemplateId =
  | 'classic'
  | 'cornell'
  | 'two-column'
  | 'knowledge-example'
  | 'workbook'

export interface BookLayoutSettings {
  fontFamily?: string
  fontSize?: number
  lineHeight?: number
  marginMm?: number
  columnGapMm?: number
  headingColor?: string
  bodyColor?: string
}

export interface KnowledgeGraphNode {
  id: string
  label: string
}

export interface KnowledgeGraphEdge {
  from: string
  to: string
  label?: string
}

export interface KnowledgeGraph {
  nodes: KnowledgeGraphNode[]
  edges: KnowledgeGraphEdge[]
}

export interface BookRecord {
  id?: string
  teacher_id?: string
  title: string
  grade: string
  level: string
  chapters: BookChapter[]
  coverStyle?: BookCoverStyle
  knowledgeGraph?: KnowledgeGraph | null
  layoutTemplate?: BookLayoutTemplateId
  layoutSettings?: BookLayoutSettings
  foreword?: string
  epilogue?: string
  exportMode?: ExportMode
  created_at?: string
  updated_at?: string
}

/* ============================================================
   华祺云师AI · 全局样式常量 (Design System)
   主色：#2584FF｜页面底色：#121722｜卡片底色：#1C2332
   正文#E8ECF3｜辅助灰#8A94A9｜卡片圆角：12px｜按钮圆角：8px
   ============================================================ */

/** 标准输入框 — 圆角8px，深色卡片底，聚焦蓝色描边 */
export const inputClass =
  'w-full rounded-[8px] border border-white/10 bg-[#1C2332] px-4 py-2.5 text-[#E8ECF3] placeholder-[#8A94A9] outline-none transition focus:border-[#2584FF] focus:ring-[3px] focus:ring-[#2584FF]/15 text-sm'

/** 标准下拉框 */
export const selectClass =
  'rounded-[8px] border border-white/10 bg-[#1C2332] text-[#E8ECF3] px-4 py-2.5 text-sm outline-none cursor-pointer transition focus:border-[#2584FF] appearance-none bg-no-repeat bg-[right_12px_center] pr-8'

/** 主按钮 — 圆角8px，品牌蓝 #2584FF，hover #0F70E8 */
export const btnPrimary =
  'inline-flex items-center justify-center gap-1.5 rounded-[8px] bg-[#2584FF] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0F70E8] active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed'

/** 次按钮 — 透明底白色边框 */
export const btnSecondary =
  'inline-flex items-center justify-center gap-1.5 rounded-[8px] border border-white/10 bg-transparent px-5 py-2.5 text-sm font-medium text-[#E8ECF3] transition hover:border-[#2584FF] hover:text-[#5C9DFF]'

/** 金色边框按钮（会员中心等） */
export const btnGold =
  'inline-flex items-center gap-1 rounded-[8px] border border-amber-500/50 bg-transparent px-4 py-1.5 text-[13px] font-medium text-amber-400 transition hover:bg-amber-500/10'

/** 卡片 hover 上浮效果 — 组合 class */
export const cardLift =
  'rounded-[12px] bg-[#1C2332] border border-white/[0.06] transition-all duration-200 hover:-translate-y-[3px] hover:bg-[#222B3E] hover:shadow-lg hover:shadow-black/30'

/** 页面标题 */
export const pageTitleClass = 'text-xl font-bold text-[#E8ECF3]'

/** 辅助描述文字 */
export const mutedTextClass = 'text-sm text-[#8A94A9]'
