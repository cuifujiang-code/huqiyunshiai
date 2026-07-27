import type {
  BankQuestion,
  BookRecord,
  BuiltExam,
  HandoutContent,
  HandoutRecord,
  KnowledgeGraph,
  LessonPlan,
  QuestionVersion,
} from '../types/teacher'
import { buildTeacherApiUrl, buildTeacherDecomposeApiUrl, buildTeacherRootApiUrl } from './apiBase'
import { fileToBase64 } from './fileBase64'
import { postApiJson } from './postApiJson'

/** 教师业务 API（题库/组卷/讲义/辅导书等）→ /api/teacher/* */
function teacherApiUrl(path: string) {
  return buildTeacherApiUrl(path)
}

/** 拆题：主站 /api/teacher/decompose-*，独立 API 域 /api/decompose-* */
function teacherDecomposeApiUrl(path: string) {
  return buildTeacherDecomposeApiUrl(path)
}

export async function fetchQuestions(
  teacherId: string,
  filters: Record<string, string | number> = {},
) {
  const params = new URLSearchParams({ teacherId, page: String(filters.page ?? 1), pageSize: String(filters.pageSize ?? 10) })
  for (const [key, value] of Object.entries(filters)) {
    if (key === 'page' || key === 'pageSize') continue
    if (value != null && String(value).trim() !== '') {
      params.set(key, String(value))
    }
  }
  const url = `${teacherApiUrl('questions')}?${params}`
  const r = await postApiJson<{ success: boolean; items: BankQuestion[]; total: number; page: number; pageSize: number; visibility: string }>(
    url,
    null,
    '题库列表',
    { method: 'GET', timeoutMs: 30000 },
  )
  if (r.kind === 'success' && r.data.success && Array.isArray(r.data.items)) return r.data
  if (r.kind === 'success' && !r.data.success) {
    throw new Error((r.data as { message?: string }).message || `题库 API 响应异常: ${JSON.stringify(r.data).slice(0, 200)}`)
  }
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

export async function fetchQuestionVersions(teacherId: string, questionId: string) {
  const params = new URLSearchParams({ teacherId })
  const r = await postApiJson<{ success: boolean; versions: QuestionVersion[] }>(
    `${teacherApiUrl(`questions/${questionId}/versions`)}?${params}`,
    null,
    '题目版本列表',
    { method: 'GET' },
  )
  if (r.kind === 'success' && r.data.success) return r.data.versions ?? []
  throw new Error(r.kind === 'fallback' ? r.reason : '加载版本历史失败')
}

export async function restoreQuestionVersion(teacherId: string, questionId: string, versionId: string) {
  const r = await postApiJson<{ success: boolean; question: BankQuestion }>(
    teacherApiUrl(`questions/${questionId}/versions/restore`),
    { teacherId, versionId },
    '恢复题目版本',
    { method: 'POST' },
  )
  if (r.kind === 'success' && r.data.success) return r.data.question
  throw new Error(r.kind === 'fallback' ? r.reason : '恢复版本失败')
}

export async function uploadQuestionImage(
  teacherId: string,
  fileBase64: string,
  fileName: string,
  mimeType: string,
) {
  const r = await postApiJson<{ success: boolean; url: string }>(
    teacherApiUrl('questions/upload-image'),
    { teacherId, fileBase64, fileName, mimeType },
    '上传题目图片',
    { timeoutMs: 60000 },
  )
  if (r.kind === 'success' && r.data.success) return r.data.url
  throw new Error(r.kind === 'fallback' ? r.reason : '图片上传失败')
}

export async function ocrCorrectQuestion(params: {
  content: string
  options?: string[]
  answer: string
  analysis: string
  subject?: string
  grade?: string
  question_type?: string
}) {
  const r = await postApiJson<{
    success: boolean
    question: Pick<BankQuestion, 'content' | 'options' | 'answer' | 'analysis'>
  }>(
    teacherApiUrl('questions/ocr-correct'),
    params,
    'AI OCR 校正',
    { timeoutMs: 90000 },
  )
  if (r.kind === 'success' && r.data.success) return r.data.question
  throw new Error(r.kind === 'fallback' ? r.reason : 'OCR 校正失败')
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

export async function batchUpdateVisibility(teacherId: string, ids: string[], visibility: 'personal' | 'public') {
  const r = await postApiJson<{ success: boolean }>(
    teacherApiUrl('questions/batch-visibility'),
    { teacherId, ids, visibility },
    '修改可见性',
  )
  if (r.kind === 'success' && r.data.success) return
  throw new Error(r.kind === 'fallback' ? r.reason : '修改可见性失败')
}

export async function batchImportQuestions(teacherId: string, questions: Partial<BankQuestion>[]) {
  const r = await postApiJson<{ success: boolean; questions: BankQuestion[]; topicTagging?: { matched: number; fallback: number; total: number } }>(
    teacherApiUrl('questions/batch'),
    { teacherId, questions },
    '批量入库',
  )
  if (r.kind === 'success' && r.data.success) {
    return { questions: r.data.questions, topicTagging: r.data.topicTagging }
  }
  throw new Error(r.kind === 'fallback' ? r.reason : '入库失败')
}

export interface QuestionImportResult {
  successCount: number
  failureCount: number
  errors: { row: number; message: string }[]
}

export async function importQuestionsFromExcel(teacherId: string, file: File): Promise<QuestionImportResult> {
  const fileBase64 = await fileToBase64(file)
  const r = await postApiJson<{ success: boolean } & QuestionImportResult>(
    teacherApiUrl('questions/import'),
    { teacherId, fileBase64, fileName: file.name },
    'Excel 批量导入',
    { timeoutMs: 120000 },
  )
  if (r.kind === 'success' && r.data.success) {
    return {
      successCount: r.data.successCount,
      failureCount: r.data.failureCount,
      errors: r.data.errors ?? [],
    }
  }
  throw new Error(r.kind === 'fallback' ? r.reason : 'Excel 导入失败')
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
  status: 'processing' | 'parsed' | 'splitting' | 'completed' | 'failed' | 'not_found'
  message?: string
  questions?: Partial<BankQuestion>[]
  error_message?: string
  batchProgress?: { total: number; completed: number; nextIndex: number } | null
  questionCount?: number
  updated_at?: string
}

export interface DecomposeTaskSummary {
  taskId: string
  teacherId: string
  fileName: string
  subject: string
  grade: string
  status: 'processing' | 'parsed' | 'splitting' | 'completed' | 'failed'
  error_message?: string | null
  questionCount: number
  batchProgress?: { total: number; completed: number; nextIndex: number } | null
  created_at: string
  updated_at: string
}

/** 提交异步拆题任务（立即返回 taskId，不等待完成） */
export async function submitDecomposeTask(
  teacherId: string,
  examFileBase64: string,
  examFileName: string,
  subject: string,
  grade: string,
): Promise<DecomposeSubmitResponse> {
  const r = await postApiJson<DecomposeSubmitResponse>(
    teacherDecomposeApiUrl('decompose-submit'),
    { teacherId, examFileBase64, examFileName, subject, grade },
    '拆题提交',
    { timeoutMs: 30000 },
  )
  if (r.kind === 'success') return r.data
  return { success: false, message: r.reason }
}

/** 查询单个拆题任务状态 */
export async function fetchDecomposeStatus(taskId: string): Promise<DecomposeStatusResponse> {
  const url = `${teacherDecomposeApiUrl('decompose-status')}?taskId=${encodeURIComponent(taskId)}`
  const r = await postApiJson<DecomposeStatusResponse>(url, null, '拆题状态', {
    method: 'GET',
    timeoutMs: 10000,
  })
  if (r.kind === 'success') return r.data
  return { success: false, status: 'failed', message: r.reason }
}

/** 查询教师所有拆题任务 */
export async function fetchDecomposeTasks(teacherId: string): Promise<DecomposeTaskSummary[]> {
  const url = `${teacherDecomposeApiUrl('decompose-tasks')}?teacherId=${encodeURIComponent(teacherId)}`
  const r = await postApiJson<{ success: boolean; tasks: DecomposeTaskSummary[] }>(url, null, '拆题任务列表', {
    method: 'GET',
    timeoutMs: 15000,
  })
  if (r.kind === 'success' && r.data.success) return r.data.tasks
  throw new Error(r.kind === 'fallback' ? r.reason : '加载任务列表失败')
}

/** 重新提交失败的拆题任务 */
export async function retryDecomposeTask(teacherId: string, taskId: string) {
  const r = await postApiJson<{ success: boolean; message?: string }>(
    teacherDecomposeApiUrl('decompose-tasks'),
    { teacherId, taskId },
    '重新拆题',
    { timeoutMs: 10000 },
  )
  if (r.kind === 'success' && r.data.success) return
  throw new Error(r.kind === 'fallback' ? r.reason : '重新拆题失败')
}

/** @deprecated 请使用 submitDecomposeTask + 任务中心查看结果 */
export async function decomposeExamPaperAsync(
  teacherId: string,
  examFileBase64: string,
  examFileName: string,
  subject: string,
  grade: string,
): Promise<Partial<BankQuestion>[]> {
  const submit = await submitDecomposeTask(teacherId, examFileBase64, examFileName, subject, grade)
  if (!submit.success || !submit.taskId) {
    throw new Error(submit.message || '提交拆题任务失败')
  }
  throw new Error('请前往任务中心查看拆题进度')
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

export async function fetchTopics(teacherId: string, subject?: string, grade?: string): Promise<import('../types/teacher').TopicsResponse> {
  const params = new URLSearchParams({ teacherId })
  if (subject) params.set('subject', subject)
  if (grade) params.set('grade', grade)
  const url = `${teacherApiUrl('questions/topics')}?${params}`
  const r = await postApiJson<{ success: boolean; grouped?: boolean; groups?: unknown; topics?: unknown; subject?: string; total?: number }>(
    url, null, '专题列表',
    { method: 'GET', timeoutMs: 15000 },
  )
  if (r.kind === 'success' && r.data.success) {
    const payload = r.data
    // 新接口：{ grouped: true, groups: [...] }
    if (payload.grouped === true && Array.isArray(payload.groups)) {
      return payload as import('../types/teacher').TopicsGroupedResponse
    }
    // 旧 handler 曾把 grouped 结果包在 topics 里
    const nested = payload.topics as { grouped?: boolean; groups?: unknown[]; subject?: string; total?: number } | Record<string, { topic: string; count: number }[]>
    if (nested && typeof nested === 'object' && !Array.isArray(nested) && nested.grouped === true && Array.isArray(nested.groups)) {
      return nested as import('../types/teacher').TopicsGroupedResponse
    }
    // 旧平铺：{ topics: { 数学: [...] } }
    if (nested && typeof nested === 'object' && !('grouped' in nested)) {
      return { grouped: false, topics: nested as Record<string, { topic: string; count: number }[]> }
    }
    return { grouped: false, topics: {} }
  }
  throw new Error(r.kind === 'fallback' ? r.reason : '加载专题失败')
}

export async function fetchQuestionStats(teacherId: string) {
  const url = `${teacherApiUrl('questions/stats')}?teacherId=${encodeURIComponent(teacherId)}`
  const r = await postApiJson<{
    success: boolean
    stats: { subjectCounts: Record<string, number>; topicCounts: Record<string, Record<string, number>> }
  }>(url, null, '题目统计', { method: 'GET', timeoutMs: 15000 })
  if (r.kind === 'success' && r.data.success) return r.data.stats
  throw new Error(r.kind === 'fallback' ? r.reason : '加载统计失败')
}

export async function fetchQuestionLearningStats(teacherId: string, questionId: string) {
  const params = new URLSearchParams({ teacherId })
  const r = await postApiJson<{ success: boolean; stats: import('../types/teacher').QuestionStats | null }>(
    `${teacherApiUrl(`questions/${questionId}/stats`)}?${params}`,
    null,
    '题目学情',
    { method: 'GET', timeoutMs: 15000 },
  )
  if (r.kind === 'success' && r.data.success) return r.data.stats
  throw new Error(r.kind === 'fallback' ? r.reason : '加载学情失败')
}

export interface AnalyticsDashboard {
  subject: string
  total_questions: number
  knowledge_heatmap: {
    knowledge_point: string
    question_count: number
    total_attempts: number
    avg_error_rate: number | null
  }[]
  high_error_questions: {
    id: string
    subject: string
    grade: string
    knowledge_point: string
    question_type: string
    difficulty: string
    content_preview: string
    total_attempts: number
    error_rate: number
    avg_score_rate: number | null
  }[]
}

export async function fetchAnalyticsDashboard(teacherId: string, subject?: string) {
  const params = new URLSearchParams({ teacherId })
  if (subject) params.set('subject', subject)
  const r = await postApiJson<{ success: boolean } & AnalyticsDashboard>(
    `${teacherApiUrl('analytics/dashboard')}?${params}`,
    null,
    '学情看板',
    { method: 'GET', timeoutMs: 30000 },
  )
  if (r.kind === 'success' && r.data.success) {
    const { success: _, ...data } = r.data
    return data as AnalyticsDashboard
  }
  throw new Error(r.kind === 'fallback' ? r.reason : '加载学情看板失败')
}

export async function generateAiVariantQuestion(teacherId: string, questionId: string) {
  const r = await postApiJson<{ success: boolean; variant: Partial<BankQuestion> }>(
    teacherApiUrl(`questions/${questionId}/ai/variant`),
    { teacherId },
    'AI变式题',
    { timeoutMs: 120000 },
  )
  if (r.kind === 'success' && r.data.success) return r.data.variant
  throw new Error(r.kind === 'fallback' ? r.reason : 'AI变式题生成失败')
}

export async function fetchAiSimilarQuestions(teacherId: string, questionId: string, limit = 8) {
  const params = new URLSearchParams({ teacherId, limit: String(limit) })
  const r = await postApiJson<{ success: boolean; similar: BankQuestion[] }>(
    `${teacherApiUrl(`questions/${questionId}/ai/similar`)}?${params}`,
    null,
    'AI同类题',
    { method: 'GET', timeoutMs: 30000 },
  )
  if (r.kind === 'success' && r.data.success) return r.data.similar ?? []
  throw new Error(r.kind === 'fallback' ? r.reason : 'AI同类题推荐失败')
}

export async function generateAiWrongAnswerExplanation(teacherId: string, questionId: string) {
  const r = await postApiJson<{ success: boolean; explanation: string }>(
    teacherApiUrl(`questions/${questionId}/ai/explanation`),
    { teacherId },
    'AI错题讲解',
    { timeoutMs: 120000 },
  )
  if (r.kind === 'success' && r.data.success) return r.data.explanation
  throw new Error(r.kind === 'fallback' ? r.reason : 'AI错题讲解失败')
}

export interface BatchAnalysisResult {
  results: { id: string; success: boolean; message?: string; question?: BankQuestion }[]
  updated: number
  skipped: number
}

export async function batchGenerateQuestionAnalysis(teacherId: string, ids: string[]) {
  const r = await postApiJson<{ success: boolean } & BatchAnalysisResult>(
    teacherApiUrl('questions/ai/batch-analysis'),
    { teacherId, ids },
    'AI批量解析',
    { timeoutMs: 300000 },
  )
  if (r.kind === 'success' && r.data.success) {
    return { results: r.data.results, updated: r.data.updated, skipped: r.data.skipped }
  }
  throw new Error(r.kind === 'fallback' ? r.reason : 'AI批量解析失败')
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

export async function fetchHandout(teacherId: string, id: string) {
  const r = await postApiJson<{ success: boolean; handout: HandoutRecord }>(
    `${teacherApiUrl(`handouts/${id}`)}?teacherId=${encodeURIComponent(teacherId)}`,
    null,
    '讲义详情',
    { method: 'GET' },
  )
  if (r.kind === 'success' && r.data.success) return r.data.handout
  throw new Error(r.kind === 'fallback' ? r.reason : '加载讲义失败')
}

export async function generateKnowledgeSummary(input: {
  subject?: string
  grade?: string
  knowledgePoint?: string
  questions?: { content?: string }[]
}) {
  const r = await postApiJson<{ success: boolean; summary: string }>(
    teacherApiUrl('handouts'),
    { action: 'knowledge-summary', ...input },
    '知识点总结',
    { timeoutMs: 60000 },
  )
  if (r.kind === 'success' && r.data.success) return r.data.summary
  throw new Error(r.kind === 'fallback' ? r.reason : '生成知识点总结失败')
}

export async function handwritingToHandout(payload: {
  teacherId: string
  pageImages?: { name: string; base64: string }[]
  workbuddyJson?: Record<string, unknown>
  title?: string
  subject?: string
  grade?: string
  mode?: string
  saveToDb?: boolean
  teacherName?: string
}) {
  const r = await postApiJson<{
    success: boolean
    message?: string
    handout?: HandoutRecord
    content: HandoutContent
    workbuddyJson?: unknown
  }>(
    buildTeacherRootApiUrl('/ocr/handwriting-to-handout'),
    payload,
    '手写讲义 OCR',
    { timeoutMs: 600_000 },
  )
  if (r.kind === 'success' && r.data.success) {
    return r.data as { handout?: HandoutRecord; content: HandoutContent; workbuddyJson?: unknown }
  }
  throw new Error(
    r.kind === 'fallback'
      ? `${r.reason}（请确认后端 node server/index.js 已启动在 3001 端口）`
      : r.data?.message || '手写解析转换失败',
  )
}

export async function handwritingToBook(payload: {
  teacherId: string
  pageImages?: { name: string; base64: string; mimeType?: string }[]
  bookJson?: Record<string, unknown>
  workbuddyJson?: Record<string, unknown>
  title?: string
  subject?: string
  grade?: string
  level?: string
  saveToDb?: boolean
}) {
  const r = await postApiJson<{
    success: boolean
    message?: string
    error?: string
    book?: BookRecord
    title: string
    grade: string
    level: string
    chapters: BookRecord['chapters']
    foreword?: string
    epilogue?: string
    ocrText?: string
  }>(
    buildTeacherRootApiUrl('/ocr/handwriting-to-book'),
    payload,
    '辅导书 OCR',
    { timeoutMs: 600_000 },
  )
  if (r.kind === 'success' && r.data.success) {
    return r.data
  }
  throw new Error(
    r.kind === 'fallback'
      ? `${r.reason}（请确认后端 node server/index.js 已启动在 3001 端口）`
      : r.data?.message || r.data?.error || '辅导书 OCR 失败',
  )
}

export async function saveBook(teacherId: string, book: Partial<BookRecord>) {
  const r = await postApiJson<{ success: boolean; book: BookRecord }>(
    teacherApiUrl('books'),
    { teacherId, ...book },
    '保存辅导书',
  )
  if (r.kind === 'success' && r.data.success) return r.data.book
  const apiMsg = r.kind === 'success' ? (r.data as { message?: string }).message : undefined
  throw new Error(
    r.kind === 'fallback'
      ? `${r.reason}（请确认后端 node server/index.js 已启动在 3001 端口）`
      : apiMsg || '保存失败',
  )
}

export async function generateBookKnowledgeGraph(questions: Partial<BankQuestion>[]) {
  const r = await postApiJson<{ success: boolean; graph: KnowledgeGraph }>(
    teacherApiUrl('books/knowledge-graph'),
    { questions },
    '知识网络图',
    { timeoutMs: 90000 },
  )
  if (r.kind === 'success' && r.data.success) return r.data.graph
  throw new Error(
    r.kind === 'fallback'
      ? `${r.reason}（请确认后端 node server/index.js 已启动在 3001 端口）`
      : '生成知识网络图失败',
  )
}

export async function generateBookForewordEpilogue(book: Partial<BookRecord>) {
  const r = await postApiJson<{ success: boolean; foreword: string; epilogue: string }>(
    teacherApiUrl('books/foreword-epilogue'),
    book,
    '前言后记',
    { timeoutMs: 90000 },
  )
  if (r.kind === 'success' && r.data.success) {
    return { foreword: r.data.foreword, epilogue: r.data.epilogue }
  }
  throw new Error(
    r.kind === 'fallback'
      ? `${r.reason}（请确认后端 node server/index.js 已启动在 3001 端口）`
      : '生成前言后记失败',
  )
}

export async function formatBookLayout(book: Partial<BookRecord> & { subject?: string }) {
  const r = await postApiJson<{ success: boolean; chapters: BookRecord['chapters'] }>(
    teacherApiUrl('books/format-layout'),
    book,
    'AI 排版校准',
    { timeoutMs: 180000 },
  )
  if (r.kind === 'success' && r.data.success) return r.data.chapters
  throw new Error(
    r.kind === 'fallback'
      ? `${r.reason}（请确认后端 node server/index.js 已启动在 3001 端口）`
      : 'AI 排版校准失败',
  )
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
