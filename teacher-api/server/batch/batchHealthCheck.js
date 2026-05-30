import { getSupabaseAdmin, isSupabaseAdminConfigured } from '../supabaseAdmin.js'

const CORE_TABLES = ['batch_decompose_tasks', 'batch_question_bank']

function resolveApiRootUrl(req) {
  const configured = process.env.TEACHER_API_URL || process.env.VITE_TEACHER_API_URL
  if (configured) return configured.replace(/\/$/, '')
  const host = req?.headers?.host
  const proto = req?.headers?.['x-forwarded-proto'] || 'https'
  if (host) return `${proto}://${host}`
  return 'https://api.huqiyunshiai.online'
}

export async function checkApiRootHealth(req) {
  const rootUrl = `${resolveApiRootUrl(req)}/`
  try {
    const response = await fetch(rootUrl, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    })
    const text = await response.text()
    let data = null
    try {
      data = JSON.parse(text)
    } catch {
      return {
        ok: false,
        url: rootUrl,
        httpStatus: response.status,
        error: `根路径未返回 JSON（Content-Type 可能为 HTML）: ${text.slice(0, 120)}`,
      }
    }
    if (response.ok && data?.status === 'ok') {
      return {
        ok: true,
        url: rootUrl,
        httpStatus: response.status,
        message: data.message || 'Teacher API is running',
      }
    }
    return {
      ok: false,
      url: rootUrl,
      httpStatus: response.status,
      error: `根路径健康检查异常: ${JSON.stringify(data).slice(0, 200)}`,
    }
  } catch (err) {
    return {
      ok: false,
      url: rootUrl,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

export async function checkSupabaseConnection() {
  if (!isSupabaseAdminConfigured()) {
    return {
      ok: false,
      configured: false,
      error: 'Supabase 未配置：请设置 SUPABASE_URL 与 SUPABASE_SERVICE_ROLE_KEY',
    }
  }
  try {
    const admin = getSupabaseAdmin()
    const { error } = await admin.from('batch_decompose_tasks').select('batch_id').limit(1)
    if (error) {
      return {
        ok: false,
        configured: true,
        error: error.message,
        code: error.code,
      }
    }
    return { ok: true, configured: true, message: 'Supabase 连接正常' }
  } catch (err) {
    return {
      ok: false,
      configured: true,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

export async function checkTableExists(tableName) {
  if (!isSupabaseAdminConfigured()) {
    return { ok: false, table: tableName, exists: false, error: 'Supabase 未配置' }
  }
  try {
    const admin = getSupabaseAdmin()
    const { error } = await admin.from(tableName).select('*').limit(0)
    if (error) {
      const missing =
        error.code === '42P01'
        || /does not exist|relation.*not found|Could not find the table/i.test(error.message || '')
      return {
        ok: false,
        table: tableName,
        exists: !missing,
        error: error.message,
        code: error.code,
      }
    }
    return { ok: true, table: tableName, exists: true, message: `表 ${tableName} 可访问` }
  } catch (err) {
    return {
      ok: false,
      table: tableName,
      exists: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

/** 批量拆题健康检查汇总 */
export async function runBatchHealthChecks(req) {
  const [apiRoot, supabase, ...tables] = await Promise.all([
    checkApiRootHealth(req),
    checkSupabaseConnection(),
    ...CORE_TABLES.map((t) => checkTableExists(t)),
  ])

  const checks = {
    apiRoot,
    supabase,
    batch_decompose_tasks: tables[0],
    batch_question_bank: tables[1],
  }

  const allOk = Object.values(checks).every((c) => c.ok)
  const anyOk = Object.values(checks).some((c) => c.ok)

  return {
    success: allOk,
    status: allOk ? 'healthy' : anyOk ? 'degraded' : 'unhealthy',
    checks,
    timestamp: new Date().toISOString(),
  }
}
