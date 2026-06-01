/**
 * 一次性脚本：重试所有卡住的批量拆题任务
 *
 * 用法（在项目根目录）：
 *   node scripts/retry-stuck-batch-tasks.js
 *
 * 环境变量（从 .env 或 teacher-api/.env 读取）：
 *   VITE_SUPABASE_URL / SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   BATCH_WORKER_SECRET（可选，否则使用 SUPABASE_SERVICE_ROLE_KEY）
 *   BATCH_AUTO_RETRY_STALE_MINUTES（可选，默认 10）
 *   BATCH_WORKER_URL（可选，默认 https://api.huqiyunshiai.online/api/batch/worker）
 */

import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, '..')

dotenv.config({ path: join(projectRoot, '.env') })
dotenv.config({ path: join(projectRoot, 'teacher-api', '.env') })

const STALE_MINUTES = Number(process.env.BATCH_AUTO_RETRY_STALE_MINUTES || 10)
const WORKER_URL = (
  process.env.BATCH_WORKER_URL
  || `${(process.env.VITE_TEACHER_API_URL || 'https://api.huqiyunshiai.online').replace(/\/$/, '')}/api/batch/worker`
)
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || ''
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const WORKER_SECRET = process.env.BATCH_WORKER_SECRET || SERVICE_ROLE_KEY

function log(msg, data) {
  const ts = new Date().toISOString()
  if (data !== undefined) {
    console.log(`[${ts}] ${msg}`, data)
  } else {
    console.log(`[${ts}] ${msg}`)
  }
}

function staleCutoffIso() {
  return new Date(Date.now() - STALE_MINUTES * 60 * 1000).toISOString()
}

async function listStuckTasks(supabase) {
  const cutoff = staleCutoffIso()
  log(`查询卡住任务：status IN (running, partial)，updated_at < ${cutoff}`)

  const { data, error } = await supabase
    .from('batch_decompose_tasks')
    .select('batch_id, teacher_id, file_name, status, updated_at, total_items, completed_items, total_questions, error_message')
    .in('status', ['running', 'partial'])
    .lt('updated_at', cutoff)
    .order('updated_at', { ascending: true })

  if (error) throw new Error(`查询失败: ${error.message}`)
  return data ?? []
}

async function countItemsByStatus(supabase, batchId) {
  const { data, error } = await supabase
    .from('batch_decompose_items')
    .select('status')
    .eq('batch_id', batchId)

  if (error) throw new Error(`查询分块失败 (${batchId}): ${error.message}`)

  const counts = { pending: 0, processing: 0, completed: 0, failed: 0 }
  for (const row of data ?? []) {
    if (counts[row.status] != null) counts[row.status]++
  }
  return counts
}

async function triggerWorker(batchId) {
  const headers = { 'Content-Type': 'application/json' }
  if (WORKER_SECRET) headers['x-batch-worker-secret'] = WORKER_SECRET

  const response = await fetch(WORKER_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ batchId }),
  })

  const bodyText = await response.text()
  let bodyJson = null
  try {
    bodyJson = JSON.parse(bodyText)
  } catch {
    // 非 JSON 响应
  }

  return {
    ok: response.ok,
    status: response.status,
    body: bodyJson ?? bodyText.slice(0, 500),
  }
}

async function main() {
  log('=== 批量拆题卡住任务重试脚本 ===')
  log(`配置`, {
    staleMinutes: STALE_MINUTES,
    workerUrl: WORKER_URL,
    supabaseConfigured: Boolean(SUPABASE_URL && SERVICE_ROLE_KEY),
    hasWorkerSecret: Boolean(WORKER_SECRET),
  })

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error('\n错误：请在 .env 或 teacher-api/.env 中配置 VITE_SUPABASE_URL 与 SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  if (!WORKER_SECRET) {
    console.warn('\n警告：未设置 BATCH_WORKER_SECRET 或 SUPABASE_SERVICE_ROLE_KEY，worker 请求可能返回 401')
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const stuckTasks = await listStuckTasks(supabase)
  log(`发现 ${stuckTasks.length} 个卡住任务`)

  if (stuckTasks.length === 0) {
    log('无需处理，退出')
    return
  }

  const results = []
  let successCount = 0
  let failCount = 0

  for (let i = 0; i < stuckTasks.length; i++) {
    const task = stuckTasks[i]
    const { batch_id: batchId, status, file_name: fileName, updated_at: updatedAt } = task

    log(`\n[${i + 1}/${stuckTasks.length}] 处理任务`, {
      batchId,
      fileName,
      status,
      updatedAt,
    })

    let counts = { pending: 0, processing: 0, completed: 0, failed: 0 }
    try {
      counts = await countItemsByStatus(supabase, batchId)
      log('  分块状态', counts)

      if (counts.pending === 0 && counts.processing === 0) {
        log('  跳过：无待处理分块（可能已是最终 partial 状态）')
        results.push({ batchId, action: 'skipped', reason: '无待处理分块', counts })
        continue
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      log('  查询分块失败', msg)
      results.push({ batchId, action: 'failed', reason: msg })
      failCount++
      continue
    }

    try {
      log(`  触发 worker → POST ${WORKER_URL}`)
      const triggered = await triggerWorker(batchId)

      if (triggered.ok) {
        log('  触发成功', { httpStatus: triggered.status, body: triggered.body })
        results.push({ batchId, action: 'retried', httpStatus: triggered.status, counts })
        successCount++
      } else {
        log('  触发失败', { httpStatus: triggered.status, body: triggered.body })
        results.push({ batchId, action: 'failed', httpStatus: triggered.status, body: triggered.body, counts })
        failCount++
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      log('  请求异常', msg)
      results.push({ batchId, action: 'failed', reason: msg, counts })
      failCount++
    }

    // 避免瞬时并发过多
    if (i < stuckTasks.length - 1) {
      await new Promise((r) => setTimeout(r, 1000))
    }
  }

  log('\n=== 汇总 ===')
  log(`扫描: ${stuckTasks.length} | 成功触发: ${successCount} | 失败: ${failCount} | 跳过: ${stuckTasks.length - successCount - failCount}`)
  console.log(JSON.stringify(results, null, 2))
}

main().catch((err) => {
  console.error('\n脚本异常退出:', err instanceof Error ? err.message : err)
  process.exit(1)
})
