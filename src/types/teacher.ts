export const TEACHER_SUBJECTS = ['语文', '数学', '英语', '物理', '化学', '生物', '历史', '地理'] as const
export const TEACHER_GRADES = ['七年级', '八年级', '九年级', '高一', '高二', '高三'] as const
export const DIFFICULTIES = ['基础', '中等', '拔高'] as const
export const QUESTION_SOURCES = ['手动录入', '试卷导入', 'AI生成'] as const

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

export interface BankQuestion {
  id?: string
  teacher_id?: string
  subject: string
  grade: string
  knowledge_point: string
  question_type: QuestionType | string
  difficulty: QuestionDifficulty | string
  content: string
  options: string[]
  answer: string
  analysis: string
  source: QuestionSource | string
  tags: string[]
  visibility?: 'personal' | 'public'
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
}

export interface HandoutModule {
  id: string
  type?: HandoutModuleType
  title: string
  content: string
  items?: string[]
  style?: HandoutModuleStyle
}

export interface HandoutCover {
  title: string
  subtitle?: string
  teacherName?: string
  date?: string
}

export interface HandoutContent {
  title: string
  cover?: HandoutCover
  modules: HandoutModule[]
  headerText?: string
  footerText?: string
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
  created_at?: string
  updated_at?: string
}

export const inputClass =
  'w-full rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-3 text-white outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30'

export const btnPrimary =
  'rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-600/30 hover:from-blue-500 hover:to-cyan-400 disabled:opacity-50'

export const btnSecondary =
  'rounded-xl border border-slate-600 bg-slate-800/80 px-4 py-2.5 text-sm text-slate-200 hover:border-blue-500/50'
