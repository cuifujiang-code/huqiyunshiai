import { getSupabaseAdmin, isSupabaseAdminConfigured } from '../supabaseAdmin.js'

const TABLE = 'teacher_decompose_tasks'

export { isSupabaseAdminConfigured as isDecomposeTaskStoreConfigured }

function nowIso() {
  return new Date().toISOString()
}

export async function createDecomposeTask({ taskId, teacherId, payload }) {
  const admin = getSupabaseAdmin()
  const { data, error } = await admin
    .from(TABLE)
    .insert({
      task_id: taskId,
      teacher_id: teacherId || null,
      status: 'processing',
      result: { payload },
      error_message: null,
      updated_at: nowIso(),
    })
    .select('task_id, status, created_at')
    .single()

  if (error) throw new Error(error.message || '创建拆题任务失败')
  return data
}

export async function getDecomposeTaskByTaskId(taskId) {
  const admin = getSupabaseAdmin()
  const { data, error } = await admin
    .from(TABLE)
    .select('*')
    .eq('task_id', taskId)
    .maybeSingle()

  if (error) throw new Error(error.message || '查询拆题任务失败')
  return data
}

export async function markDecomposeTaskCompleted(taskId, questions) {
  const admin = getSupabaseAdmin()
  const task = await getDecomposeTaskByTaskId(taskId)
  const { error } = await admin
    .from(TABLE)
    .update({
      status: 'completed',
      result: { ...(task?.result ?? {}), questions },
      error_message: null,
      updated_at: nowIso(),
    })
    .eq('task_id', taskId)

  if (error) throw new Error(error.message || '更新拆题结果失败')
}

export async function markDecomposeTaskFailed(taskId, errorMessage) {
  const admin = getSupabaseAdmin()
  const { error } = await admin
    .from(TABLE)
    .update({
      status: 'failed',
      error_message: errorMessage,
      updated_at: nowIso(),
    })
    .eq('task_id', taskId)

  if (error) throw new Error(error.message || '更新失败状态失败')
}

export async function listDecomposeTasksByTeacher(teacherId, limit = 50) {
  const admin = getSupabaseAdmin()
  const { data, error } = await admin
    .from(TABLE)
    .select('task_id, teacher_id, status, result, error_message, created_at, updated_at')
    .eq('teacher_id', teacherId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(error.message || '查询拆题任务列表失败')
  return data ?? []
}

export function formatDecomposeTaskSummary(task) {
  const payload = task.result?.payload ?? {}
  const batchProgress = task.result?.batchProgress ?? null
  return {
    taskId: task.task_id,
    teacherId: task.teacher_id,
    fileName: payload.examFileName || '未知文件',
    subject: payload.subject || '',
    grade: payload.grade || '',
    status: task.status,
    error_message: task.error_message,
    questionCount: Array.isArray(task.result?.questions) ? task.result.questions.length : 0,
    batchProgress,
    created_at: task.created_at,
    updated_at: task.updated_at,
  }
}

/** 分批拆题过程中写入 partial result */
export async function markDecomposeTaskPartialProgress(taskId, partial) {
  const admin = getSupabaseAdmin()
  const task = await getDecomposeTaskByTaskId(taskId)
  const { error } = await admin
    .from(TABLE)
    .update({
      status: 'splitting',
      result: {
        ...(task?.result ?? {}),
        payload: partial.payload ?? task?.result?.payload,
        parsedText: partial.parsedText ?? task?.result?.parsedText,
        meta: partial.meta ?? task?.result?.meta,
        questions: partial.questions ?? [],
        batchProgress: partial.batchProgress ?? null,
      },
      error_message: null,
      updated_at: nowIso(),
    })
    .eq('task_id', taskId)

  if (error) throw new Error(error.message || '保存拆题进度失败')
}

/** 失败后重新拆题：保留试卷数据，清空题目结果 */
export async function resetDecomposeTaskForRetry(taskId) {
  const admin = getSupabaseAdmin()
  const task = await getDecomposeTaskByTaskId(taskId)
  const payload = task?.result?.payload
  if (!payload?.examFileBase64) {
    throw new Error('无法重试：任务缺少试卷文件')
  }

  const { error } = await admin
    .from(TABLE)
    .update({
      status: 'processing',
      error_message: null,
      result: {
        payload,
        parsedText: null,
        meta: null,
        questions: [],
        batchProgress: null,
      },
      updated_at: nowIso(),
    })
    .eq('task_id', taskId)

  if (error) throw new Error(error.message || '重置任务失败')
  return task
}

/** 保存解析后的试卷文本（两步拆题中间态） */
export async function markDecomposeTaskParsed(taskId, parsedText, meta) {
  const admin = getSupabaseAdmin()
  const task = await getDecomposeTaskByTaskId(taskId)
  const payload = task?.result?.payload ?? {}
  const { error } = await admin
    .from(TABLE)
    .update({
      status: 'parsed',
      result: { payload, parsedText, meta },
      updated_at: nowIso(),
    })
    .eq('task_id', taskId)

  if (error) throw new Error(error.message || '保存解析文本失败')
}
