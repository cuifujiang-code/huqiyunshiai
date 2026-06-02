export type QuestionType = '选择题' | '填空题' | '计算题' | '简答题' | '实验题' | '解答题'

export interface ExamQuestion {
  id: number
  type: QuestionType
  content: string
  options?: string[]
  answer: string
  analysis: string
  knowledgeTags: string[]
  score?: number
}

export interface ExamPaper {
  title: string
  duration: number
  totalScore: number
  subject: string
  grade: string
  difficulty: string
  questions: ExamQuestion[]
  source?: 'ai' | 'mock'
}

export type Subject =
  | '语文'
  | '数学'
  | '英语'
  | '物理'
  | '化学'
  | '生物'
  | '历史'
  | '地理'

export type Grade = '七年级' | '八年级' | '九年级' | '高一' | '高二' | '高三'

export type Difficulty = '基础' | '中等' | '拔高'

export interface GenerateExamRequest {
  prompt: string
  subject: Subject
  grade: Grade
  difficulty: Difficulty
}

export interface GenerateExamResponse {
  success: boolean
  message?: string
  exam?: ExamPaper
  isMockFallback?: boolean
}

export const SUBJECTS: Subject[] = [
  '语文', '数学', '英语', '物理', '化学', '生物', '历史', '地理',
]

export const GRADES: Grade[] = ['七年级', '八年级', '九年级', '高一', '高二', '高三']

export const DIFFICULTIES: Difficulty[] = ['基础', '中等', '拔高']

/** 每科对应的通用题型列表（组卷页面用） */
export const SUBJECT_EXAM_TYPES: Record<Subject, QuestionType[]> = {
  '语文': ['选择题', '填空题', '简答题', '解答题'],
  '数学': ['选择题', '填空题', '计算题', '解答题'],
  '英语': ['选择题', '填空题', '简答题', '解答题'],
  '物理': ['选择题', '填空题', '实验题', '计算题', '解答题'],
  '化学': ['选择题', '填空题', '实验题', '计算题', '解答题'],
  '生物': ['选择题', '填空题', '实验题', '解答题'],
  '历史': ['选择题', '填空题', '简答题', '解答题'],
  '地理': ['选择题', '填空题', '简答题', '解答题'],
}

export const QUESTION_TYPE_ORDER: QuestionType[] = [
  '选择题', '填空题', '计算题', '简答题', '实验题', '解答题',
]
