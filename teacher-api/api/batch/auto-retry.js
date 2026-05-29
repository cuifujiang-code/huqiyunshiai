import '../../server/applyUrlShim.js'
import { applyApiHeaders, handleOptions } from '../../server/apiResponse.js'
import { runBatchAutoRetry } from '../../server/batch/batchAutoRetry.js'
import { isBatchStoreConfigured } from '../../server/batch/batchTaskStore.js'

function verifyCronAuth(req) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return true
  const auth = req.headers?.authorization
  if (!auth) return true
  return auth === `Bearer ${cronSecret}`
}

export default async function handler(req, res) {
  if (handleOptions(req, res)) return
  applyApiHeaders(req, res)

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' })
  }

  if (!verifyCronAuth(req)) {
    return res.status(401).json({ success: false, message: 'Unauthorized' })
  }

  if (!isBatchStoreConfigured()) {
    return res.status(503).json({ success: false, message: 'Supabase 未配置' })
  }

  try {
    console.log('[batch/auto-retry] 开始扫描卡住任务', {
      source: req.headers?.['x-vercel-cron'] ? 'vercel-cron' : 'manual',
    })
    const report = await runBatchAutoRetry(req)
    return res.status(200).json({ success: true, ...report })
  } catch (error) {
    console.error('[batch/auto-retry]', error)
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : '自动恢复失败',
    })
  }
}

export const config = {
  maxDuration: 60,
  includeFiles: 'server/**',
}
