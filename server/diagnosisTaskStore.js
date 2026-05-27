import { createClient } from '@supabase/supabase-js'

const TABLE = 'diagnosis_tasks'

const TASK_INSERT_COLUMNS = ['task_id', 'user_id', 'status', 'result', 'error_message', 'updated_at']
const TASK_OCR_DONE_COLUMNS = ['status', 'ocr_result', 'error_message', 'updated_at']
const TASK_UPDATE_RESULT_COLUMNS = ['status', 'result', 'error_message', 'updated_at']
const TASK_UPDATE_FAILED_COLUMNS = ['status', 'error_message', 'updated_at']

const TASK_SELECT_COLUMNS =
  'id, task_id, user_id, status, result, ocr_result, error_message, created_at, updated_at'

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

function pickColumns(source, allowedKeys) {
  const row = {}
  for (const key of allowedKeys) {
    if (key in source) row[key] = source[key]
  }
  return row
}

/** 创建任务：result 暂存用户提交数据，完成后覆盖为诊断报告 */
export async function createDiagnosisTask({ taskId, userId, result }) {
  if (result == null) {
    throw new Error('创建诊断任务缺少 result 数据')
  }

  const admin = getAdminClient()
  const row = pickColumns(
    {
      task_id: taskId,
      user_id: userId || null,
      status: 'processing',
      result,
      error_message: null,
      updated_at: new Date().toISOString(),
    },
    TASK_INSERT_COLUMNS,
  )

  const { data, error } = await admin.from(TABLE).insert(row).select('id, task_id, status, created_at').single()

  if (error) {
    console.error('[diagnosisTaskStore] create failed', error, { columns: Object.keys(row) })
    throw new Error(error.message || '创建诊断任务失败')
  }

  return data
}

export async function getDiagnosisTaskByTaskId(taskId) {
  const admin = getAdminClient()
  const { data, error } = await admin
    .from(TABLE)
    .select(TASK_SELECT_COLUMNS)
    .eq('task_id', taskId)
    .maybeSingle()

  if (error) {
    console.error('[diagnosisTaskStore] get failed', error)
    throw new Error(error.message || '查询诊断任务失败')
  }

  return data
}

export async function markDiagnosisTaskOcrDone(taskId, ocrResult) {
  const admin = getAdminClient()
  const row = pickColumns(
    {
      status: 'ocr_done',
      ocr_result: ocrResult,
      error_message: null,
      updated_at: new Date().toISOString(),
    },
    TASK_OCR_DONE_COLUMNS,
  )

  const { error } = await admin.from(TABLE).update(row).eq('task_id', taskId)

  if (error) {
    console.error('[diagnosisTaskStore] ocr_done failed', error, { columns: Object.keys(row) })
    throw new Error(error.message || '更新 OCR 结果失败')
  }
}

export async function markDiagnosisTaskCompleted(taskId, result) {
  const admin = getAdminClient()
  const row = pickColumns(
    {
      status: 'completed',
      result,
      error_message: null,
      updated_at: new Date().toISOString(),
    },
    TASK_UPDATE_RESULT_COLUMNS,
  )

  const { error } = await admin.from(TABLE).update(row).eq('task_id', taskId)

  if (error) {
    console.error('[diagnosisTaskStore] complete failed', error, { columns: Object.keys(row) })
    throw new Error(error.message || '更新任务状态失败')
  }
}

export async function markDiagnosisTaskFailed(taskId, errorMessage) {
  const admin = getAdminClient()
  const row = pickColumns(
    {
      status: 'failed',
      error_message: errorMessage,
      updated_at: new Date().toISOString(),
    },
    TASK_UPDATE_FAILED_COLUMNS,
  )

  const { error } = await admin.from(TABLE).update(row).eq('task_id', taskId)

  if (error) {
    console.error('[diagnosisTaskStore] fail update failed', error, { columns: Object.keys(row) })
    throw new Error(error.message || '更新任务失败状态失败')
  }
}
