import '../../server/applyUrlShim.js'
import { applyApiHeaders, handleOptions } from '../../server/apiResponse.js'
import { getSupabaseAdmin, getServiceRoleKey } from '../../server/supabaseAdmin.js'

export default async function handler(req, res) {
  if (handleOptions(req, res)) return
  applyApiHeaders(req, res)

  try {
    const admin = getSupabaseAdmin()

    // 1. 检查环境变量
    const url = process.env.SUPABASE_URL || ''
    const key = getServiceRoleKey()
    const keyInfo = key ? `SET (len=${key.length}, prefix=${key.slice(0, 10)}...)` : 'NOT SET'

    // 2. 解码 JWT
    let jwtInfo = {}
    try {
      const parts = key.split('.')
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'))
      jwtInfo = { role: payload.role, exp: payload.exp ? new Date(payload.exp * 1000).toISOString() : 'N/A' }
    } catch (e) {
      jwtInfo = { error: e.message }
    }

    // 3. 查询 batch_question_bank 总数
    const { count: bankCount, error: bankCountErr } = await admin
      .from('batch_question_bank')
      .select('id', { count: 'exact', head: true })

    // 4. 查询最近 5 个任务（含真实 COUNT）
    const { data: tasks, error: tasksErr } = await admin
      .from('batch_decompose_tasks')
      .select('batch_id, status, file_name, total_items, completed_items, total_questions, imported_questions, error_message, created_at, updated_at')
      .order('created_at', { ascending: false })
      .limit(5)

    // 5. 为每个任务查询 batch_question_bank 真实数量
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
      })
    ) : []

    // 6. 测试写入一条数据（用 null item_id）
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

    // 7. COUNT 验证写入
    let verifyCount = 0
    if (!insertErr) {
      const { count } = await admin
        .from('batch_question_bank')
        .select('id', { count: 'exact', head: true })
        .eq('batch_id', testBatchId)
      verifyCount = count ?? 0
      // 清理
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
        insertError: insertErr ? { message: insertErr.message, code: insertErr.code, details: insertErr.details, hint: insertErr.hint } : null,
        verifyCount,
      },
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    })
  }
}
