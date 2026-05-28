import type {
  BankQuestion,
  BookRecord,
  BuiltExam,
  HandoutContent,
  HandoutRecord,
  LessonPlan,
} from '../types/teacher'
import { postApiJson } from './postApiJson'

const TEACHER_API_BASE = (import.meta.env.VITE_TEACHER_API_URL ?? 'https://api.huqiyunshiai.online').replace(/\/$/, '')

function teacherApiUrl(path: string) {
  const normalized = path.replace(/^\//, '')
  return `${TEACHER_API_BASE}/${normalized}`
}

export async function fetchQuestions(
  teacherId: string,
  filters: Record<string, string | number> = {},
) {
  const params = new URLSearchParams({ teacherId, ...Object.fromEntries(Object.entries(filters).map(([k, v]) => [k, String(v)])) })
  const r = await postApiJson<{ success: boolean; items: BankQuestion[]; total: number; page: number; pageSize: number }>(
    `${teacherApiUrl('questions')}?${params}`,
    null,
    '题库列表',
    { method: 'GET', timeoutMs: 30000 },
  )
  if (r.kind === 'success' && r.data.success) return r.data
  throw new Error(r.kind === 'fallback' ? r.reason : '加载题库失败')
}

export async function createQuestion(teacherId: string, question: Partial<BankQuestion>) {
  const r = await postApiJson<{ success: boolean; question: BankQuestion }>(
    teacherApiUrl('questions'),
    { teacherId, ...question },
    '创建题目',
  )
  if (r.kind === 'success' && r.data.success) return r.data.question
  throw new Error(r.kind === 'fallback' ? r.reason : '创建失败')
}

export async function updateQuestion(teacherId: string, id: string, question: Partial<BankQuestion>) {
  const r = await postApiJson<{ success: boolean; question: BankQuestion }>(
    teacherApiUrl(`questions/${id}`),
    { teacherId, ...question },
    '更新题目',
    { method: 'PUT' },
  )
  if (r.kind === 'success' && r.data.success) return r.data.question
  throw new Error(r.kind === 'fallback' ? r.reason : '更新失败')
}

export async function deleteQuestions(teacherId: string, ids: string[]) {
  const r = await postApiJson<{ success: boolean }>(
    teacherApiUrl('questions'),
    { teacherId, ids },
    '删除题目',
    { method: 'DELETE' },
  )
  if (r.kind === 'success' && r.data.success) return
  throw new Error(r.kind === 'fallback' ? r.reason : '删除失败')
}

export async function batchUpdateTags(teacherId: string, ids: string[], tags: string[]) {
  const r = await postApiJson<{ success: boolean }>(
    teacherApiUrl('questions/batch-tags'),
    { teacherId, ids, tags },
    '批量标签',
  )
  if (r.kind === 'success' && r.data.success) return
  throw new Error(r.kind === 'fallback' ? r.reason : '更新标签失败')
}

export async function batchImportQuestions(teacherId: string, questions: Partial<BankQuestion>[]) {
  const r = await postApiJson<{ success: boolean; questions: BankQuestion[] }>(
    teacherApiUrl('questions/batch'),
    { teacherId, questions },
    '批量入库',
  )
  if (r.kind === 'success' && r.data.success) return r.data.questions
  throw new Error(r.kind === 'fallback' ? r.reason : '入库失败')
}

const DECOMPOSE_POLL_INTERVAL_MS = 3000
const DECOMPOSE_POLL_MAX = 20

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export interface DecomposeSubmitResponse {
  success: boolean
  taskId?: string
  status?: string
  message?: string
}

export interface DecomposeStatusResponse {
  success: boolean
  taskId?: string
  status: 'processing' | 'parsed' | 'completed' | 'failed' | 'not_found'
  message?: string
  questions?: Partial<BankQuestion>[]
  error_message?: string
}

/** 提交异步拆题任务 */
export async function submitDecomposeTask(
  teacherId: string,
  examFileBase64: string,
  examFileName: string,
  subject: string,
  grade: string,
): Promise<DecomposeSubmitResponse> {
  const r = await postApiJson<DecomposeSubmitResponse>(
    teacherApiUrl('decompose-submit'),
    { teacherId, examFileBase64, examFileName, subject, grade },
    '拆题提交',
    { timeoutMs: 10000 },
  )
  if (r.kind === 'success') return r.data
  return { success: false, message: r.reason }
}

/** 查询拆题任务状态 */
export async function fetchDecomposeStatus(taskId: string): Promise<DecomposeStatusResponse> {
  const url = `${teacherApiUrl('decompose-status')}?taskId=${encodeURIComponent(taskId)}`
  const r = await postApiJson<DecomposeStatusResponse>(url, null, '拆题状态', {
    method: 'GET',
    timeoutMs: 10000,
  })
  if (r.kind === 'success') return r.data
  return { success: false, status: 'failed', message: r.reason }
}

/** 提交并轮询直至拆题完成 */
export async function decomposeExamPaperAsync(
  teacherId: string,
  examFileBase64: string,
  examFileName: string,
  subject: string,
  grade: string,
  onProgress?: (msg: string) => void,
): Promise<Partial<BankQuestion>[]> {
  onProgress?.('拆题中...')

  const submit = await submitDecomposeTask(teacherId, examFileBase64, examFileName, subject, grade)
  if (!submit.success || !submit.taskId) {
    throw new Error(submit.message || '提交拆题任务失败')
  }

  const taskId = submit.taskId

  for (let i = 0; i < DECOMPOSE_POLL_MAX; i++) {
    if (i > 0) await sleep(DECOMPOSE_POLL_INTERVAL_MS)

    const status = await fetchDecomposeStatus(taskId)

    if (status.status === 'processing' || status.status === 'parsed') {
      onProgress?.(status.message || '拆题中...')
      continue
    }

    if (status.status === 'failed') {
      throw new Error(status.message || status.error_message || '拆题失败')
    }

    if (status.status === 'completed' && status.questions) {
      return status.questions
    }

    if (status.status === 'not_found') {
      throw new Error('拆题任务不存在')
    }
  }

  throw new Error('拆题处理超时，请稍后重试')
}

/** @deprecated 同步拆题，易超时 */
export async function splitExamPaper(
  examFileBase64: string,
  examFileName: string,
  subject: string,
  grade: string,
) {
  const r = await postApiJson<{ success: boolean; questions: Partial<BankQuestion>[] }>(
    teacherApiUrl('questions-import/split'),
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
    teacherApiUrl('questions/generate'),
    params,
    'AI出题',
    { timeoutMs: 60000 },
  )
  if (r.kind === 'success' && r.data.success) return r.data.question
  throw new Error(r.kind === 'fallback' ? r.reason : 'AI出题失败')
}

export async function buildExam(teacherId: string, config: Record<string, unknown>) {
  const r = await postApiJson<{ success: boolean; exam: BuiltExam }>(
    teacherApiUrl('exam-builder'),
    { teacherId, ...config },
    '智能组卷',
    { timeoutMs: 60000 },
  )
  if (r.kind === 'success' && r.data.success) return r.data.exam
  throw new Error(r.kind === 'fallback' ? r.reason : '组卷失败')
}

export async function fetchLessonPlans(teacherId: string) {
  const r = await postApiJson<{ success: boolean; plans: LessonPlan[] }>(
    `${teacherApiUrl('lesson-plans')}?teacherId=${encodeURIComponent(teacherId)}`,
    null,
    '备课列表',
    { method: 'GET' },
  )
  if (r.kind === 'success' && r.data.success) return r.data.plans
  throw new Error(r.kind === 'fallback' ? r.reason : '加载备课失败')
}

export async function saveLessonPlan(teacherId: string, plan: Partial<LessonPlan>) {
  const r = await postApiJson<{ success: boolean; plan: LessonPlan }>(
    teacherApiUrl('lesson-plans'),
    { teacherId, ...plan },
    '保存备课',
  )
  if (r.kind === 'success' && r.data.success) return r.data.plan
  throw new Error(r.kind === 'fallback' ? r.reason : '保存失败')
}

export async function generateHandoutDraft(mode: string, input: Record<string, unknown>) {
  const r = await postApiJson<{ success: boolean; draft: HandoutContent }>(
    teacherApiUrl('handouts'),
    { action: 'generate', mode, ...input },
    '生成讲义',
    { timeoutMs: 60000 },
  )
  if (r.kind === 'success' && r.data.success) return r.data.draft
  throw new Error(r.kind === 'fallback' ? r.reason : '生成讲义失败')
}

export async function saveHandout(teacherId: string, handout: Partial<HandoutRecord>) {
  const r = await postApiJson<{ success: boolean; handout: HandoutRecord }>(
    teacherApiUrl('handouts'),
    { teacherId, ...handout },
    '保存讲义',
  )
  if (r.kind === 'success' && r.data.success) return r.data.handout
  throw new Error(r.kind === 'fallback' ? r.reason : '保存讲义失败')
}

export async function fetchHandouts(teacherId: string) {
  const r = await postApiJson<{ success: boolean; handouts: HandoutRecord[] }>(
    `${teacherApiUrl('handouts')}?teacherId=${encodeURIComponent(teacherId)}`,
    null,
    '讲义列表',
    { method: 'GET' },
  )
  if (r.kind === 'success' && r.data.success) return r.data.handouts
  throw new Error(r.kind === 'fallback' ? r.reason : '加载讲义失败')
}

export async function saveBook(teacherId: string, book: Partial<BookRecord>) {
  const r = await postApiJson<{ success: boolean; book: BookRecord }>(
    teacherApiUrl('books'),
    { teacherId, ...book },
    '保存辅导书',
  )
  if (r.kind === 'success' && r.data.success) return r.data.book
  throw new Error(r.kind === 'fallback' ? r.reason : '保存失败')
}

export async function fetchBooks(teacherId: string) {
  const r = await postApiJson<{ success: boolean; books: BookRecord[] }>(
    `${teacherApiUrl('books')}?teacherId=${encodeURIComponent(teacherId)}`,
    null,
    '辅导书列表',
    { method: 'GET' },
  )
  if (r.kind === 'success' && r.data.success) return r.data.books
  throw new Error(r.kind === 'fallback' ? r.reason : '加载失败')
}
