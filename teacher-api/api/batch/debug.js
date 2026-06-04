import '../../server/applyUrlShim.js'
import { applyApiHeaders, handleOptions } from '../../server/apiResponse.js'
import { verifyBatchWorkerSecret } from '../../server/batch/batchTrigger.js'
import { getSupabaseAdmin, getServiceRoleKey } from '../../server/supabaseAdmin.js'

export default async function handler(req, res) {
  if (handleOptions(req, res)) return
  applyApiHeaders(req, res)

  if (!verifyBatchWorkerSecret(req)) {
    return res.status(401).json({ success: false, message: '未授权：需要有效的 x-batch-worker-secret' })
  }

  try {
    const admin = getSupabaseAdmin()

    const url = process.env.SUPABASE_URL || ''
    const key = getServiceRoleKey()
    const keyInfo = key ? `SET (len=${key.length})` : 'NOT SET'

    let jwtInfo = {}
    try {
      const parts = key.split('.')
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'))
      jwtInfo = { role: payload.role, exp: payload.exp ? new Date(payload.exp * 1000).toISOString() : 'N/A' }
    } catch (e) {
      jwtInfo = { error: e.message }
    }

    const { count: bankCount, error: bankCountErr } = await admin
      .from('batch_question_bank')
      .select('id', { count: 'exact', head: true })

    const { data: tasks, error: tasksErr } = await admin
      .from('batch_decompose_tasks')
      .select('batch_id, status, file_name, total_items, completed_items, total_questions, imported_questions, error_message, created_at, updated_at')
      .order('created_at', { ascending: false })
      .limit(5)

    const tasksWithRealCount = tasks ? await Promise.all(
      tasks.map(async (t) => {
        try {
          const { count, error } = await admin
            .from('batch_question_bank')
            .select('id', { count: 'exact', head: true })
            .eq('batch_id', t.batch_id)
          return { ...t, real_bank_count: count ?? 0, bank_error: error?.message || null }
        } catch (e) {
          return { ...t, real_bank_count: '查询失败', bank_error: e.message }
        }
      }),
    ) : []

    const testBatchId = 'debug-' + Date.now()
    const { error: insertErr, status: insertStatus } = await admin
      .from('batch_question_bank')
      .insert({
        batch_id: testBatchId,
        teacher_id: 'debug',
        item_id: null,
        subject: '数学',
        grade: '八年级',
        question_type: '选择题',
        content: '调试测试题目',
        options: [],
        answer: 'A',
        analysis: '测试',
      })

    let verifyCount = 0
    if (!insertErr) {
      const { count } = await admin
        .from('batch_question_bank')
        .select('id', { count: 'exact', head: true })
        .eq('batch_id', testBatchId)
      verifyCount = count ?? 0
      await admin.from('batch_question_bank').delete().eq('batch_id', testBatchId)
    }

    return res.status(200).json({
      success: true,
      env: {
        supabaseUrl: url ? url.slice(0, 30) + '...' : 'NOT SET',
        serviceRoleKey: keyInfo,
        jwt: jwtInfo,
      },
      database: {
        batch_question_bank_count: bankCount,
        batch_question_bank_count_error: bankCountErr ? bankCountErr.message : null,
      },
      recent_tasks: tasksWithRealCount,
      recent_tasks_error: tasksErr ? tasksErr.message : null,
      write_test: {
        insertStatus,
        insertError: insertErr ? { message: insertErr.message, code: insertErr.code } : null,
        verifyCount,
      },
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
