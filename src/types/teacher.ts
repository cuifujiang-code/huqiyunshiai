export const TEACHER_SUBJECTS = ['语文', '数学', '英语', '物理', '化学', '生物', '历史', '地理'] as const
export const TEACHER_GRADES = ['七年级', '八年级', '九年级', '高一', '高二', '高三'] as const
export const QUESTION_TYPES = ['选择题', '填空题', '计算题', '证明题', '实验题', '应用题'] as const
export const DIFFICULTIES = ['基础', '中等', '拔高'] as const
export const QUESTION_SOURCES = ['手动录入', '试卷导入', 'AI生成'] as const

export type TeacherSubject = (typeof TEACHER_SUBJECTS)[number]
export type TeacherGrade = (typeof TEACHER_GRADES)[number]
export type QuestionType = (typeof QUESTION_TYPES)[number]
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

export type HandoutMode = 'school' | 'tutoring' | 'targeted'

export interface HandoutModule {
  id: string
  title: string
  content: string
  items?: string[]
}

export interface HandoutContent {
  title: string
  modules: HandoutModule[]
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

export interface BookRecord {
  id?: string
  teacher_id?: string
  title: string
  grade: string
  level: string
  chapters: BookChapter[]
  created_at?: string
  updated_at?: string
}

export const inputClass =
  'w-full rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-3 text-white outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30'

export const btnPrimary =
  'rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-600/30 hover:from-blue-500 hover:to-cyan-400 disabled:opacity-50'

export const btnSecondary =
  'rounded-xl border border-slate-600 bg-slate-800/80 px-4 py-2.5 text-sm text-slate-200 hover:border-blue-500/50'
