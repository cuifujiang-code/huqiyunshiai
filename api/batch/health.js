import '../../server/applyUrlShim.js'
import { setNoCacheHeaders } from '../../server/apiResponse.js'
import { isBatchStoreConfigured } from '../../server/batch/batchTaskStore.js'
import { getSupabaseAdmin } from '../../server/supabaseAdmin.js'

export default async function handler(req, res) {
  setNoCacheHeaders(res)

  const checks = {}

  // 1. API 根路径
  checks.apiRoot = { ok: true, message: 'batch API is running' }

  // 2. Supabase 连接 (同时验证 batch_decompose_tasks 表)
  if (!isBatchStoreConfigured()) {
    checks.supabase = { ok: false, error: 'Supabase 未配置：请设置 SUPABASE_URL 与 SUPABASE_SERVICE_ROLE_KEY' }
  } else {
    try {
      const admin = getSupabaseAdmin()
      const { error } = await admin.from('batch_decompose_tasks').select('id').limit(1)
      if (error) {
        checks.supabase = { ok: false, error: error.message }
      } else {
        checks.supabase = { ok: true, message: 'Supabase 连接正常，batch_decompose_tasks 表可用' }
      }
    } catch (e) {
      checks.supabase = { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  }

  // 3. batch_question_bank 表
  if (checks.supabase?.ok) {
    try {
      const admin = getSupabaseAdmin()
      const { error } = await admin.from('batch_question_bank').select('id').limit(1)
      checks.batch_question_bank = error
        ? { ok: false, error: error.message, table: 'batch_question_bank' }
        : { ok: true, exists: true, table: 'batch_question_bank' }
    } catch (e) {
      checks.batch_question_bank = { ok: false, error: e instanceof Error ? e.message : String(e), table: 'batch_question_bank' }
    }
  }

  // 4. DeepSeek AI 配置
  checks.deepseek = (() => {
    const key = process.env.DEEPSEEK_API_KEY
    if (!key) return { ok: false, error: 'DEEPSEEK_API_KEY 未配置，AI 拆题无法工作' }
    return { ok: true, message: `已配置 (model: ${process.env.DEEPSEEK_MODEL || 'deepseek-chat'})` }
  })()

  // 5. Worker 调度模式
  checks.workerDispatch = {
    ok: true,
    message: process.env.BATCH_WORKER_DISPATCH || 'direct',
    note: 'direct = 同函数内 waitUntil 执行（推荐）；http = 自引用 HTTP 调用',
  }

  // 6. Vercel 部署信息
  checks.vercelConfig = (() => {
    const url = process.env.VERCEL_URL
    const env = process.env.VERCEL_ENV
    if (!url) return { ok: false, error: 'VERCEL_URL 未自动注入，Worker 链式触发将失败' }
    return {
      ok: true,
      message: `https://${url}`,
      env: env || '(not set)',
      workerUrl: `https://${url}/api/batch/worker`,
    }
  })()

  const allOk = Object.values(checks).every((c) => c.ok !== false)
  const anyFailed = Object.values(checks).some((c) => c.ok === false)
  const status = allOk ? 'healthy' : anyFailed ? 'unhealthy' : 'degraded'

  return res.status(allOk ? 200 : 503).json({
    success: allOk,
    status,
    timestamp: new Date().toISOString(),
    checks,
  })
}

export const config = {
  maxDuration: 10,
  includeFiles: 'server/**',
}
