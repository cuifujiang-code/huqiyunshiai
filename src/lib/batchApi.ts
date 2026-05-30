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

export interface BatchUploadResult {
  success: boolean
  batchId: string
  taskId: string
  status: string
  totalItems: number
  total_chunks: number
  chunkCount: number
  message: string
  autoStarted?: boolean
  startFailed?: boolean
  startError?: string
}

/** 统一解析上传响应中的分块数量与 batchId（兼容多种字段名） */
export function normalizeBatchUploadResponse(raw: Record<string, unknown>): BatchUploadResult {
  const batchId = String(raw.batchId ?? raw.batch_id ?? raw.taskId ?? raw.task_id ?? '')
  const totalItems = Number(
    raw.totalItems ?? raw.total_items ?? raw.total_chunks ?? raw.totalChunks ?? raw.chunkCount ?? 0,
  )
  return {
    success: raw.success !== false,
    batchId,
    taskId: batchId,
    status: String(raw.status ?? 'pending'),
    totalItems: Number.isFinite(totalItems) ? totalItems : 0,
    total_chunks: Number.isFinite(totalItems) ? totalItems : 0,
    chunkCount: Number.isFinite(totalItems) ? totalItems : 0,
    message: String(raw.message ?? ''),
    autoStarted: Boolean(raw.autoStarted),
    startFailed: Boolean(raw.startFailed),
    startError: raw.startError ? String(raw.startError) : undefined,
  }
}

export async function uploadBatchTask(
  teacherId: string,
  examFileBase64: string,
  examFileName: string,
  subject: string,
  grade: string,
) {
  const data = await callBatch<Record<string, unknown>>(
    batchApiUrl('batch/upload'),
    { teacherId, examFileBase64, examFileName, subject, grade, autoStart: true },
    '批量上传',
  )
  return normalizeBatchUploadResponse(data)
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
    progress?: BatchProgress
    questions: BatchQuestion[]
    error?: string
    message?: string
  }>(
    `${batchApiUrl('batch/progress')}?${params}`,
    null,
    '批量进度',
    'GET',
  ).then((data) => ({
    ...data,
    questions: normalizeBatchQuestions(data.questions),
    error: data.error ?? (data.success === false ? data.message : undefined),
  }))
}

export async function listBatchTasks(teacherId: string) {
  const params = new URLSearchParams({ teacherId })
  const data = await callBatch<{ success: boolean; tasks?: BatchProgress[]; message?: string }>(
    `${batchApiUrl('batch/upload')}?${params}`,
    null,
    '批量任务列表',
    'GET',
  )
  return {
    success: data.success !== false,
    tasks: Array.isArray(data.tasks) ? data.tasks : [],
    message: data.message,
  }
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

export interface BatchHealthCheckItem {
  ok: boolean
  error?: string
  message?: string
  exists?: boolean
  table?: string
  url?: string
}

export interface BatchHealthReport {
  success: boolean
  status: 'healthy' | 'degraded' | 'unhealthy'
  error?: string
  timestamp: string
  checks: {
    apiRoot?: BatchHealthCheckItem
    supabase?: BatchHealthCheckItem
    batch_decompose_tasks?: BatchHealthCheckItem
    batch_question_bank?: BatchHealthCheckItem
  }
}

/** 批量拆题系统健康检查 */
export async function fetchBatchHealth() {
  return callBatch<BatchHealthReport>(
    batchApiUrl('batch/health'),
    null,
    '批量健康检查',
    'GET',
  )
}

/** 根据健康检查与任务状态，生成空题目列表的诊断提示 */
export function diagnoseEmptyQuestions(
  health: BatchHealthReport | null,
  task: BatchProgress | undefined,
  apiError?: string,
): string {
  if (apiError) {
    if (/batch_question_bank|relation|does not exist|column/i.test(apiError)) {
      return '题库表结构异常或未迁移，请联系管理员在 Supabase 执行迁移 SQL'
    }
    if (/Supabase|未配置|connection|connect/i.test(apiError)) {
      return '数据库连接异常，请联系管理员'
    }
    return `查询失败：${apiError}`
  }

  if (!health) {
    return '无法连接健康检查服务，请确认 API 域名配置正确'
  }

  if (!health.checks?.supabase?.ok) {
    return '数据库连接异常，请联系管理员'
  }

  if (health.checks?.batch_question_bank && !health.checks.batch_question_bank.ok) {
    return '题库表 batch_question_bank 不可用，请联系管理员执行数据库迁移'
  }

  if (!health.checks?.apiRoot?.ok) {
    return 'Teacher API 根路径异常，请确认 Vercel Root Directory 为 teacher-api'
  }

  if (!task) {
    return '批次未找到，请检查任务状态'
  }

  if (task.status === 'running' || task.pendingItems > 0 || task.processingItems > 0) {
    return '题目正在处理中，请稍后重试'
  }

  if (task.status === 'pending') {
    return '任务尚未启动，请点击「启动」开始拆题'
  }

  if (task.status === 'failed') {
    return `拆题任务失败${task.errorMessage ? `：${task.errorMessage}` : '，请重新上传试卷'}`
  }

  if (task.importedQuestions === 0 && (task.status === 'completed' || task.status === 'partial')) {
    return '拆题已完成但未检测到入库题目，请重新上传新试卷或联系管理员查看 API 日志'
  }

  return '该批次暂无题目记录，请重新上传新试卷'
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
