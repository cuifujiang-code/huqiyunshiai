import { getTeacherApiBase } from './apiBase'
import { postApiJson } from './postApiJson'

function getBatchApiBase(): string {
  return `${getTeacherApiBase()}/api`
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
  tags?: string[]
  has_image_placeholder?: boolean
}

export const BATCH_IMAGE_PLACEHOLDER = '[图片占位符]'

export function questionHasImagePlaceholder(q: Pick<BatchQuestion, 'content' | 'tags' | 'has_image_placeholder'>) {
  if (q.has_image_placeholder) return true
  if (q.tags?.includes('含图片占位符')) return true
  return q.content.includes(BATCH_IMAGE_PLACEHOLDER) || /\[图片占位符\]/.test(q.content)
}

export function normalizeBatchQuestions(raw: unknown): BatchQuestion[] {
  if (!Array.isArray(raw)) return []
  return raw.map((q, index) => {
    const row = q as Record<string, unknown>
    const sortOrder = Number(row.sort_order)
    const content = String(row.content ?? '').trim() || `题目 ${index + 1}`
    const tags = Array.isArray(row.tags) ? row.tags.map(String) : []
    const hasImagePlaceholder = Boolean(row.has_image_placeholder)
      || tags.includes('含图片占位符')
      || content.includes(BATCH_IMAGE_PLACEHOLDER)
    return {
      id: String(row.id ?? `batch-q-${index}`),
      content,
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
      tags,
      has_image_placeholder: hasImagePlaceholder,
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

/** 从 API 原始响应中提取 batchId（兼容嵌套 data/result/task 与 snake_case） */
export function extractBatchId(raw: unknown): string {
  if (!raw || typeof raw !== 'object') return ''
  const obj = raw as Record<string, unknown>
  const nested = [obj.data, obj.result, obj.task, obj.payload].find(
    (v) => v && typeof v === 'object',
  ) as Record<string, unknown> | undefined

  const candidates = [
    obj.batchId,
    obj.batch_id,
    obj.taskId,
    obj.task_id,
    nested?.batchId,
    nested?.batch_id,
    nested?.taskId,
    nested?.task_id,
  ]

  for (const value of candidates) {
    if (value != null && String(value).trim()) {
      return String(value).trim()
    }
  }
  return ''
}

/** 统一解析上传响应中的分块数量与 batchId（兼容多种字段名） */
export function normalizeBatchUploadResponse(raw: Record<string, unknown>): BatchUploadResult {
  const batchId = extractBatchId(raw)
  const source = (raw.data && typeof raw.data === 'object' ? raw.data : raw) as Record<string, unknown>
  const totalItems = Number(
    source.totalItems ?? source.total_items ?? source.total_chunks ?? source.totalChunks ?? source.chunkCount ?? 0,
  )
  return {
    success: raw.success !== false,
    batchId,
    taskId: batchId,
    status: String(source.status ?? raw.status ?? 'pending'),
    totalItems: Number.isFinite(totalItems) ? totalItems : 0,
    total_chunks: Number.isFinite(totalItems) ? totalItems : 0,
    chunkCount: Number.isFinite(totalItems) ? totalItems : 0,
    message: String(source.message ?? raw.message ?? ''),
    autoStarted: Boolean(source.autoStarted ?? raw.autoStarted),
    startFailed: Boolean(source.startFailed ?? raw.startFailed),
    startError: (source.startError ?? raw.startError) ? String(source.startError ?? raw.startError) : undefined,
  }
}

export async function uploadBatchTask(
  teacherId: string,
  examFileBase64: string,
  examFileName: string,
  subject: string,
  grade: string,
  options?: { autoStart?: boolean; knowledgeCoverage?: string },
) {
  const data = await callBatch<Record<string, unknown>>(
    batchApiUrl('batch/upload'),
    {
      teacherId,
      examFileBase64,
      examFileName,
      subject,
      grade,
      autoStart: options?.autoStart ?? true,
      ...(options?.knowledgeCoverage ? { knowledgeCoverage: options.knowledgeCoverage } : {}),
    },
    '批量上传',
  )
  const normalized = normalizeBatchUploadResponse(data)
  if (!normalized.batchId) {
    console.warn('[batchApi] 上传响应缺少 batchId', {
      url: batchApiUrl('batch/upload'),
      raw: data,
      hint: '若 raw 含 status:"ok" 而无 batchId，说明请求落到了健康检查路由，请检查 Vercel Root Directory 与 teacher-api 部署',
    })
    throw new Error(
      '上传成功但未返回 batchId：API 可能未正确路由到 batch/upload，或 Supabase 未配置。请检查 teacher-api 部署与环境变量 SUPABASE_URL、SUPABASE_SERVICE_ROLE_KEY',
    )
  }
  return normalized
}

/** uploadBatchTask 别名，兼容旧调用名 uploadExam */
export const uploadExam = uploadBatchTask

export async function startBatchTask(teacherId: string, batchId: string, options?: { rerun?: boolean }) {
  return callBatch<{ success: boolean; batchId: string; status: string; message: string }>(
    batchApiUrl('batch/start'),
    { teacherId, batchId, ...(options?.rerun ? { rerun: true } : {}) },
    options?.rerun ? '重新拆题' : '启动批量拆题',
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

function isTaskStuck(task: BatchProgress, staleMinutes = 3) {
  if (task.status !== 'running' && task.status !== 'partial') return false
  if (task.pendingItems <= 0 && task.processingItems <= 0) return false
  const ageMs = Date.now() - new Date(task.updatedAt).getTime()
  return ageMs > staleMinutes * 60 * 1000
}

export { isTaskStuck }
