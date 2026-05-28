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
