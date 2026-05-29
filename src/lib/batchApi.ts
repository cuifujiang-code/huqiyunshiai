import { postApiJson } from './postApiJson'

const DEFAULT_TEACHER_API = 'https://api.huqiyunshiai.online'

function getBatchApiBase(): string {
  const teacherApi = (import.meta.env.VITE_TEACHER_API_URL ?? '').replace(/\/$/, '')
  if (teacherApi) {
    return `${teacherApi}/api`
  }
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/api`
  }
  return `${DEFAULT_TEACHER_API}/api`
}

function batchApiUrl(path: string) {
  const normalized = path.replace(/^\//, '')
  return `${getBatchApiBase()}/${normalized}`
}

export interface BatchProgress {
  batchId: string
  teacherId: string
  fileName: string
  subject: string
  grade: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'partial'
  totalItems: number
  completedItems: number
  failedItems: number
  pendingItems: number
  processingItems: number
  totalQuestions: number
  importedQuestions: number
  progressPercent: number
  errorMessage?: string
  createdAt: string
  updatedAt: string
}

export interface BatchQuestion {
  id: string
  content: string
  options: string[]
  answer: string
  analysis: string
  geometry_desc?: string
  latex_blocks?: string[]
  question_type: string
  difficulty: string
  knowledge_point: string
  subject: string
  grade: string
  sort_order?: number
  question_number?: string
}

export function normalizeBatchQuestions(raw: unknown): BatchQuestion[] {
  if (!Array.isArray(raw)) return []
  return raw.map((q, index) => {
    const row = q as Record<string, unknown>
    const sortOrder = Number(row.sort_order)
    return {
      id: String(row.id ?? `batch-q-${index}`),
      content: String(row.content ?? '').trim() || `题目 ${index + 1}`,
      options: Array.isArray(row.options) ? row.options.map(String) : [],
      answer: String(row.answer ?? '').trim() || '暂无',
      analysis: String(row.analysis ?? '').trim() || '暂无',
      geometry_desc: String(row.geometry_desc ?? '').trim(),
      latex_blocks: Array.isArray(row.latex_blocks) ? row.latex_blocks.map(String) : [],
      question_type: String(row.question_type ?? '应用题'),
      difficulty: String(row.difficulty ?? '中等'),
      knowledge_point: String(row.knowledge_point ?? '未分类'),
      subject: String(row.subject ?? '数学'),
      grade: String(row.grade ?? '八年级'),
      sort_order: Number.isFinite(sortOrder) ? sortOrder : index + 1,
      question_number: String(row.question_number ?? sortOrder ?? index + 1),
    }
  })
}

async function callBatch<T>(url: string, body: unknown, label: string, method: 'GET' | 'POST' = 'POST') {
  const r = await postApiJson<T>(url, body, label, { method, timeoutMs: 120000 })
  if (r.kind === 'success') return r.data
  throw new Error(r.reason)
}

export async function uploadBatchTask(
  teacherId: string,
  examFileBase64: string,
  examFileName: string,
  subject: string,
  grade: string,
) {
  return callBatch<{
    success: boolean
    batchId: string
    status: string
    totalItems: number
    message: string
  }>(
    batchApiUrl('batch/upload'),
    { teacherId, examFileBase64, examFileName, subject, grade },
    '批量上传',
  )
}

export async function startBatchTask(teacherId: string, batchId: string) {
  return callBatch<{ success: boolean; batchId: string; status: string; message: string }>(
    batchApiUrl('batch/start'),
    { teacherId, batchId },
    '启动批量拆题',
  )
}

export async function fetchBatchProgress(teacherId: string, batchId: string, withQuestions = false) {
  const params = new URLSearchParams({
    teacherId,
    batchId,
    ...(withQuestions ? { withQuestions: 'true' } : {}),
  })
  return callBatch<{
    success: boolean
    progress: BatchProgress
    questions: BatchQuestion[]
  }>(
    `${batchApiUrl('batch/progress')}?${params}`,
    null,
    '批量进度',
    'GET',
  ).then((data) => ({
    ...data,
    questions: normalizeBatchQuestions(data.questions),
  }))
}

export async function listBatchTasks(teacherId: string) {
  const params = new URLSearchParams({ teacherId })
  return callBatch<{ success: boolean; tasks: BatchProgress[] }>(
    `${batchApiUrl('batch/upload')}?${params}`,
    null,
    '批量任务列表',
    'GET',
  )
}

export interface BatchAutoRetryReport {
  success: boolean
  scanned: number
  processed: number
  failed: number
  skipped: number
  staleMinutes: number
  details?: Array<{
    batchId: string
    previousStatus: string
    action: string
    reason: string
  }>
}

/** 自动恢复卡住的批量任务（running/partial 超时未更新） */
export async function triggerBatchAutoRetry() {
  return callBatch<BatchAutoRetryReport>(
    batchApiUrl('batch/auto-retry'),
    null,
    '批量自动恢复',
    'GET',
  )
}

function isTaskStuck(task: BatchProgress, staleMinutes = 10) {
  if (task.status !== 'running' && task.status !== 'partial') return false
  if (task.pendingItems <= 0 && task.processingItems <= 0) return false
  const ageMs = Date.now() - new Date(task.updatedAt).getTime()
  return ageMs > staleMinutes * 60 * 1000
}

export { isTaskStuck }
