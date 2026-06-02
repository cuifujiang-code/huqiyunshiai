import type { BuiltExam } from './teacher'
import type { BasketQuestion } from '../context/QuestionBasketContext'

export type ExamFontFamily = '宋体' | '黑体' | '微软雅黑' | '楷体'
export type ExamFontSizeLabel = '三号' | '四号' | '小四' | '五号'
export type ExamColumnMode = 'single' | 'double'
export type ExamNumberStyle = 'dot' | 'paren' | 'bracket'
export type ExamOptionsLayout = 'horizontal' | 'vertical'
export type ExamAnswerMode = 'practice' | 'lecture' | 'homework'
export type ExamTextAlign = 'left' | 'center' | 'right'

export interface ExamPageMargins {
  top: number
  bottom: number
  left: number
  right: number
}

export interface ExamHeaderFooter {
  text: string
  align: ExamTextAlign
  visible: boolean
}

export interface ExamLayoutConfig {
  fontFamily: ExamFontFamily
  fontSize: ExamFontSizeLabel
  lineHeight: number
  columnMode: ExamColumnMode
  margins: ExamPageMargins
  numberStyle: ExamNumberStyle
  optionsLayout: ExamOptionsLayout
  answerMode: ExamAnswerMode
  header: ExamHeaderFooter
  footer: ExamHeaderFooter
}

export interface LayoutExamQuestion {
  number: number
  content: string
  options: string[]
  answer: string
  analysis: string
  score?: number
  question_type?: string
}

export interface LayoutExamSection {
  question_type: string
  questions: LayoutExamQuestion[]
}

export interface LayoutExamData {
  title: string
  subject: string
  grade: string
  totalScore: number
  sections: LayoutExamSection[]
}

export const EXAM_FONT_FAMILIES: ExamFontFamily[] = ['宋体', '黑体', '微软雅黑', '楷体']
export const EXAM_FONT_SIZES: ExamFontSizeLabel[] = ['三号', '四号', '小四', '五号']
export const EXAM_LINE_HEIGHTS = [1.0, 1.2, 1.5, 1.8, 2.0] as const

export const FONT_FAMILY_CSS: Record<ExamFontFamily, string> = {
  宋体: 'SimSun, "Songti SC", serif',
  黑体: 'SimHei, "Heiti SC", sans-serif',
  微软雅黑: '"Microsoft YaHei", "PingFang SC", sans-serif',
  楷体: 'KaiTi, "Kaiti SC", serif',
}

/** 中文字号 → pt */
export const FONT_SIZE_PT: Record<ExamFontSizeLabel, number> = {
  三号: 16,
  四号: 14,
  小四: 12,
  五号: 10.5,
}

export const DEFAULT_EXAM_LAYOUT: ExamLayoutConfig = {
  fontFamily: '宋体',
  fontSize: '小四',
  lineHeight: 1.5,
  columnMode: 'single',
  margins: { top: 48, bottom: 48, left: 56, right: 56 },
  numberStyle: 'dot',
  optionsLayout: 'horizontal',
  answerMode: 'practice',
  header: { text: '', align: 'center', visible: false },
  footer: { text: '', align: 'center', visible: false },
}

export function formatQuestionNumber(n: number, style: ExamNumberStyle): string {
  if (style === 'paren') return `(${n})`
  if (style === 'bracket') return `【${n}】`
  return `${n}.`
}

export function builtExamToLayoutData(exam: BuiltExam): LayoutExamData {
  return {
    title: exam.title,
    subject: exam.subject,
    grade: exam.grade,
    totalScore: exam.totalScore,
    sections: exam.sections.map((sec) => ({
      question_type: sec.question_type,
      questions: sec.questions.map((q) => ({
        number: q.number ?? 0,
        content: q.content,
        options: q.options ?? [],
        answer: q.answer ?? '',
        analysis: q.analysis ?? '',
        score: q.score,
        question_type: sec.question_type,
      })),
    })),
  }
}

export function basketToLayoutData(items: BasketQuestion[], title = '试卷排版预览'): LayoutExamData {
  const grouped: Record<string, BasketQuestion[]> = {}
  for (const item of items) {
    const t = item.question_type || '解答题'
    if (!grouped[t]) grouped[t] = []
    grouped[t].push(item)
  }

  let num = 1
  const sections = Object.entries(grouped).map(([question_type, qs]) => ({
    question_type,
    questions: qs.map((q) => ({
      number: num++,
      content: q.content,
      options: q.options ?? [],
      answer: q.answer ?? '',
      analysis: q.analysis ?? '',
      score: 5,
      question_type,
    })),
  }))

  const first = items[0]
  return {
    title,
    subject: first?.subject ?? '数学',
    grade: first?.grade ?? '八年级',
    totalScore: items.length * 5,
    sections,
  }
}

export const EXAM_LAYOUT_STORAGE_KEY = 'huqiyunshiai_exam_layout_data'

export function saveLayoutExamData(data: LayoutExamData) {
  try {
    sessionStorage.setItem(EXAM_LAYOUT_STORAGE_KEY, JSON.stringify(data))
  } catch {
    // ignore
  }
}

export function loadLayoutExamData(): LayoutExamData | null {
  try {
    const raw = sessionStorage.getItem(EXAM_LAYOUT_STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as LayoutExamData
  } catch {
    return null
  }
}
