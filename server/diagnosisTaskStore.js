import { createClient } from '@supabase/supabase-js'

const TABLE = 'diagnosis_tasks'

function getSupabaseUrl() {
  return process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || ''
}

function getServiceRoleKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || ''
}

export function isDiagnosisTaskStoreConfigured() {
  return Boolean(getSupabaseUrl() && getServiceRoleKey())
}

function getAdminClient() {
  const url = getSupabaseUrl()
  const key = getServiceRoleKey()
  if (!url || !key) {
    throw new Error(
      'Supabase 未配置：请在环境变量中设置 VITE_SUPABASE_URL 与 SUPABASE_SERVICE_ROLE_KEY',
    )
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export async function createDiagnosisTask({ taskId, userId, payload }) {
  const admin = getAdminClient()
  const row = {
    task_id: taskId,
    user_id: userId || null,
    status: 'processing',
    payload,
    result: null,
    error_message: null,
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await admin.from(TABLE).insert(row).select('id, task_id, status, created_at').single()

  if (error) {
    console.error('[diagnosisTaskStore] create failed', error)
    throw new Error(error.message || '创建诊断任务失败')
  }

  return data
}

export async function getDiagnosisTaskByTaskId(taskId) {
  const admin = getAdminClient()
  const { data, error } = await admin.from(TABLE).select('*').eq('task_id', taskId).maybeSingle()

  if (error) {
    console.error('[diagnosisTaskStore] get failed', error)
    throw new Error(error.message || '查询诊断任务失败')
  }

  return data
}

export async function markDiagnosisTaskCompleted(taskId, result) {
  const admin = getAdminClient()
  const { error } = await admin
    .from(TABLE)
    .update({
      status: 'completed',
      result,
      error_message: null,
      updated_at: new Date().toISOString(),
    })
    .eq('task_id', taskId)

  if (error) {
    console.error('[diagnosisTaskStore] complete failed', error)
    throw new Error(error.message || '更新任务状态失败')
  }
}

export async function markDiagnosisTaskFailed(taskId, errorMessage) {
  const admin = getAdminClient()
  const { error } = await admin
    .from(TABLE)
    .update({
      status: 'failed',
      error_message: errorMessage,
      updated_at: new Date().toISOString(),
    })
    .eq('task_id', taskId)

  if (error) {
    console.error('[diagnosisTaskStore] fail update failed', error)
    throw new Error(error.message || '更新任务失败状态失败')
  }
}
