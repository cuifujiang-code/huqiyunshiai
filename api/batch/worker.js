import '../../server/applyUrlShim.js'
import { waitUntil } from '@vercel/functions'
import { setNoCacheHeaders } from '../../server/apiResponse.js'
import { verifyBatchWorkerSecret } from '../../server/batch/batchTrigger.js'
import { safeRunBatchWorker } from '../../server/batch/batchWorker.js'

function getEnvSummary() {
  return {
    hasSupabaseUrl: Boolean(process.env.SUPABASE_URL),
    hasServiceRoleKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    hasDeepSeekKey: Boolean(process.env.DEEPSEEK_API_KEY),
    vercelEnv: process.env.VERCEL_ENV || '(not set)',
    vercelUrl: process.env.VERCEL_URL || '(not set)',
    batchWorkerDispatch: process.env.BATCH_WORKER_DISPATCH || 'direct',
  }
}

export default async function handler(req, res) {
  setNoCacheHeaders(res)

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' })
  }

  if (!verifyBatchWorkerSecret(req)) {
    return res.status(401).json({ success: false, message: 'Unauthorized' })
  }

  const batchId = req.body?.batchId
  if (!batchId) {
    return res.status(400).json({ success: false, message: '缺少 batchId' })
  }

  const env = getEnvSummary()
  console.log('[batch/worker] 受理请求', { batchId, env })

  if (!env.hasSupabaseUrl || !env.hasServiceRoleKey) {
    return res.status(503).json({
      success: false, batchId,
      message: 'Supabase 未配置：缺少 SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY',
    })
  }

  if (!env.hasDeepSeekKey) {
    return res.status(503).json({
      success: false, batchId,
      message: 'DEEPSEEK_API_KEY 未配置，无法调用 AI 拆题',
    })
  }

  // 使用 waitUntil 确保 Vercel 不提前杀进程
  waitUntil(
    safeRunBatchWorker(batchId).catch((err) => {
      console.error('[batch/worker] 后台异常', batchId, err instanceof Error ? err.message : String(err))
    }),
  )

  return res.status(202).json({
    success: true,
    batchId,
    message: 'Worker 已受理，正在后台并发处理',
    envDiagnostics: {
      supabase: 'ok',
      deepseek: 'ok',
      dispatch: env.batchWorkerDispatch,
    },
  })
}

export const config = {
  maxDuration: 60,
  includeFiles: '{server/**,node_modules/mammoth/**,node_modules/pdf-parse/**,node_modules/pdfjs-dist/**}',
}
