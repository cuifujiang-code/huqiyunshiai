export type QuestionType = '选择题' | '填空题' | '计算题' | '简答题' | '实验题'

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
}

export const SUBJECTS: Subject[] = [
  '语文',
  '数学',
  '英语',
  '物理',
  '化学',
  '生物',
  '历史',
  '地理',
]

export const GRADES: Grade[] = ['七年级', '八年级', '九年级', '高一', '高二', '高三']

export const DIFFICULTIES: Difficulty[] = ['基础', '中等', '拔高']

export const QUESTION_TYPE_ORDER: QuestionType[] = [
  '选择题',
  '填空题',
  '计算题',
  '简答题',
  '实验题',
]
