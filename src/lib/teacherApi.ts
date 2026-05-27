import type {
  BankQuestion,
  BookRecord,
  BuiltExam,
  HandoutContent,
  HandoutRecord,
  LessonPlan,
} from '../types/teacher'
import { postApiJson } from './postApiJson'

const BASE = '/api/teacher'

function teacherPath(segments: string) {
  return `${BASE}/${segments}`
}

export async function fetchQuestions(
  teacherId: string,
  filters: Record<string, string | number> = {},
) {
  const params = new URLSearchParams({ teacherId, ...Object.fromEntries(Object.entries(filters).map(([k, v]) => [k, String(v)])) })
  const r = await postApiJson<{ success: boolean; items: BankQuestion[]; total: number; page: number; pageSize: number }>(
    `${teacherPath('questions')}?${params}`,
    null,
    '题库列表',
    { method: 'GET', timeoutMs: 30000 },
  )
  if (r.kind === 'success' && r.data.success) return r.data
  throw new Error(r.kind === 'fallback' ? r.reason : '加载题库失败')
}

export async function createQuestion(teacherId: string, question: Partial<BankQuestion>) {
  const r = await postApiJson<{ success: boolean; question: BankQuestion }>(
    teacherPath('questions'),
    { teacherId, ...question },
    '创建题目',
  )
  if (r.kind === 'success' && r.data.success) return r.data.question
  throw new Error(r.kind === 'fallback' ? r.reason : '创建失败')
}

export async function updateQuestion(teacherId: string, id: string, question: Partial<BankQuestion>) {
  const r = await postApiJson<{ success: boolean; question: BankQuestion }>(
    teacherPath(`questions/${id}`),
    { teacherId, ...question },
    '更新题目',
    { method: 'PUT' },
  )
  if (r.kind === 'success' && r.data.success) return r.data.question
  throw new Error(r.kind === 'fallback' ? r.reason : '更新失败')
}

export async function deleteQuestions(teacherId: string, ids: string[]) {
  const r = await postApiJson<{ success: boolean }>(
    teacherPath('questions'),
    { teacherId, ids },
    '删除题目',
    { method: 'DELETE' },
  )
  if (r.kind === 'success' && r.data.success) return
  throw new Error(r.kind === 'fallback' ? r.reason : '删除失败')
}

export async function batchUpdateTags(teacherId: string, ids: string[], tags: string[]) {
  const r = await postApiJson<{ success: boolean }>(
    teacherPath('questions/batch-tags'),
    { teacherId, ids, tags },
    '批量标签',
  )
  if (r.kind === 'success' && r.data.success) return
  throw new Error(r.kind === 'fallback' ? r.reason : '更新标签失败')
}

export async function batchImportQuestions(teacherId: string, questions: Partial<BankQuestion>[]) {
  const r = await postApiJson<{ success: boolean; questions: BankQuestion[] }>(
    teacherPath('questions/batch'),
    { teacherId, questions },
    '批量入库',
  )
  if (r.kind === 'success' && r.data.success) return r.data.questions
  throw new Error(r.kind === 'fallback' ? r.reason : '入库失败')
}

export async function splitExamPaper(
  examFileBase64: string,
  examFileName: string,
  subject: string,
  grade: string,
) {
  const r = await postApiJson<{ success: boolean; questions: Partial<BankQuestion>[] }>(
    teacherPath('questions-import/split'),
    { examFileBase64, examFileName, subject, grade },
    '试卷拆题',
    { timeoutMs: 60000 },
  )
  if (r.kind === 'success' && r.data.success) return r.data.questions
  throw new Error(r.kind === 'fallback' ? r.reason : '拆题失败')
}

export async function generateQuestion(params: {
  subject: string
  grade: string
  question_type: string
  difficulty: string
  knowledge_point: string
}) {
  const r = await postApiJson<{ success: boolean; question: BankQuestion }>(
    teacherPath('questions/generate'),
    params,
    'AI出题',
    { timeoutMs: 60000 },
  )
  if (r.kind === 'success' && r.data.success) return r.data.question
  throw new Error(r.kind === 'fallback' ? r.reason : 'AI出题失败')
}

export async function buildExam(teacherId: string, config: Record<string, unknown>) {
  const r = await postApiJson<{ success: boolean; exam: BuiltExam }>(
    teacherPath('exam-builder'),
    { teacherId, ...config },
    '智能组卷',
    { timeoutMs: 60000 },
  )
  if (r.kind === 'success' && r.data.success) return r.data.exam
  throw new Error(r.kind === 'fallback' ? r.reason : '组卷失败')
}

export async function fetchLessonPlans(teacherId: string) {
  const r = await postApiJson<{ success: boolean; plans: LessonPlan[] }>(
    `${teacherPath('lesson-plans')}?teacherId=${encodeURIComponent(teacherId)}`,
    null,
    '备课列表',
    { method: 'GET' },
  )
  if (r.kind === 'success' && r.data.success) return r.data.plans
  throw new Error(r.kind === 'fallback' ? r.reason : '加载备课失败')
}

export async function saveLessonPlan(teacherId: string, plan: Partial<LessonPlan>) {
  const r = await postApiJson<{ success: boolean; plan: LessonPlan }>(
    teacherPath('lesson-plans'),
    { teacherId, ...plan },
    '保存备课',
  )
  if (r.kind === 'success' && r.data.success) return r.data.plan
  throw new Error(r.kind === 'fallback' ? r.reason : '保存失败')
}

export async function generateHandoutDraft(mode: string, input: Record<string, unknown>) {
  const r = await postApiJson<{ success: boolean; draft: HandoutContent }>(
    teacherPath('handouts'),
    { action: 'generate', mode, ...input },
    '生成讲义',
    { timeoutMs: 60000 },
  )
  if (r.kind === 'success' && r.data.success) return r.data.draft
  throw new Error(r.kind === 'fallback' ? r.reason : '生成讲义失败')
}

export async function saveHandout(teacherId: string, handout: Partial<HandoutRecord>) {
  const r = await postApiJson<{ success: boolean; handout: HandoutRecord }>(
    teacherPath('handouts'),
    { teacherId, ...handout },
    '保存讲义',
  )
  if (r.kind === 'success' && r.data.success) return r.data.handout
  throw new Error(r.kind === 'fallback' ? r.reason : '保存讲义失败')
}

export async function fetchHandouts(teacherId: string) {
  const r = await postApiJson<{ success: boolean; handouts: HandoutRecord[] }>(
    `${teacherPath('handouts')}?teacherId=${encodeURIComponent(teacherId)}`,
    null,
    '讲义列表',
    { method: 'GET' },
  )
  if (r.kind === 'success' && r.data.success) return r.data.handouts
  throw new Error(r.kind === 'fallback' ? r.reason : '加载讲义失败')
}

export async function saveBook(teacherId: string, book: Partial<BookRecord>) {
  const r = await postApiJson<{ success: boolean; book: BookRecord }>(
    teacherPath('books'),
    { teacherId, ...book },
    '保存辅导书',
  )
  if (r.kind === 'success' && r.data.success) return r.data.book
  throw new Error(r.kind === 'fallback' ? r.reason : '保存失败')
}

export async function fetchBooks(teacherId: string) {
  const r = await postApiJson<{ success: boolean; books: BookRecord[] }>(
    `${teacherPath('books')}?teacherId=${encodeURIComponent(teacherId)}`,
    null,
    '辅导书列表',
    { method: 'GET' },
  )
  if (r.kind === 'success' && r.data.success) return r.data.books
  throw new Error(r.kind === 'fallback' ? r.reason : '加载失败')
}
