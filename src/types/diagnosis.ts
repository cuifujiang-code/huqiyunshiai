export type ExamType = '单元测试' | '月考' | '期中考试' | '期末考试' | '模拟考'

export type DiagnosisSubject =
  | '语文'
  | '数学'
  | '英语'
  | '物理'
  | '化学'
  | '生物'
  | '历史'
  | '地理'

export interface ExamFileItem {
  name: string
  type: 'docx' | 'pdf'
  sizeBytes: number
  /** 仅 prepare 阶段上传用，确认后不再发送 */
  base64?: string
}

export interface AnswerSheetImage {
  id: string
  name: string
  base64: string
  mimeType: string
  previewUrl: string
  sizeBytes: number
}

export interface DiagnosisFormData {
  examType: ExamType
  subject: DiagnosisSubject
  score: number
  fullScore: number
  gradeRank?: number
  confusion: string
  /** 标准试卷 Word/PDF */
  examFile?: ExamFileItem | null
  /** 学生手写答题卡（最多 5 张） */
  answerSheetImages?: AnswerSheetImage[]
  /** 解析后的试卷原文 */
  examPaperText?: string
  /** 答题卡 OCR 合并文本 */
  answerSheetOcrText?: string
  /** @deprecated 兼容旧字段 */
  ocrText?: string
  ocrIncomplete?: boolean
}

export interface LossReasonItem {
  type: 'knowledge' | 'ability' | 'skill' | 'psychology'
  label: string
  percentage: number
  color: string
  explanation: string
}

export interface WeakPoint {
  id: string
  name: string
  weight: number
  typicalWrong: string
  correctSolution: string
}

export interface WrongQuestionAnalysis {
  id: string
  content: string
  studentAnswer: string
  correctAnswer: string
  thinkingBlock: string
}

export interface PlanTask {
  id: string
  text: string
  completed: boolean
}

export interface PlanDay {
  day: string
  tasks: PlanTask[]
}

export interface RecommendedExercise {
  id: string
  content: string
  type: string
  difficulty: string
}

export interface DiagnosisReport {
  title: string
  generatedAt: string
  scoreOverview: {
    score: number
    fullScore: number
    gradeRank?: number
    gradeTotal?: number
    previousRank?: number
    rankImprovement?: number
    classRank?: number
    previousScore?: number
    trend: 'up' | 'down' | 'stable'
    trendDelta: number
    percentile: number
  }
  lossAnalysis: LossReasonItem[]
  weakPoints: WeakPoint[]
  wrongQuestions: WrongQuestionAnalysis[]
  improvementPlan: PlanDay[]
  recommendedExercises: RecommendedExercise[]
  imageAnalysisSummary?: string
  source?: 'ai' | 'mock'
}

export interface DiagnosisResponse {
  success: boolean
  message?: string
  report?: DiagnosisReport
  isMockFallback?: boolean
  debugSource?: string
  errorDetail?: unknown
  deepseekConfig?: { hasApiKey: boolean; apiBase: string; model: string; visionModel?: string; url: string }
  action?: 'prepare' | 'analyze'
  examPaperText?: string
  examFileName?: string
  answerSheetOcrText?: string
  ocrIncomplete?: boolean
  answerSheetPageCount?: number
  examPaperType?: string
}

export const EXAM_TYPES: ExamType[] = ['单元测试', '月考', '期中考试', '期末考试', '模拟考']

export const DIAGNOSIS_SUBJECTS: DiagnosisSubject[] = [
  '语文',
  '数学',
  '英语',
  '物理',
  '化学',
  '生物',
  '历史',
  '地理',
]

export const ANALYSIS_STEPS = [
  '正在识别知识点掌握情况...',
  '正在分析错题原因...',
  '正在匹配薄弱环节...',
  '正在生成个性化提升方案...',
]
