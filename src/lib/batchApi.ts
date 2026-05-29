import { postApiJson } from './postApiJson'

const TEACHER_API_BASE = (import.meta.env.VITE_TEACHER_API_URL ?? 'https://api.huqiyunshiai.online').replace(/\/$/, '')

function batchApiUrl(path: string) {
  const normalized = path.replace(/^\//, '')
  return `${TEACHER_API_BASE}/${normalized}`
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
    questions?: BatchQuestion[]
  }>(
    `${batchApiUrl('batch/progress')}?${params}`,
    null,
    '批量进度',
    'GET',
  )
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
