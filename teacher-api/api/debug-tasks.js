import '../server/applyUrlShim.js'
import { createServiceRoleClient } from '../server/supabaseAdmin.js'
import { applyApiHeaders, handleOptions } from '../server/apiResponse.js'

export default async function handler(req, res) {
  if (handleOptions(req, res)) return
  applyApiHeaders(req, res)

  try {
    const admin = createServiceRoleClient()

    // 查 teacher_decompose_tasks
    const { data: teacherTasks, error: tErr } = await admin
      .from('teacher_decompose_tasks')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)

    // 查 batch_decompose_tasks
    const { data: batchTasks, error: bErr } = await admin
      .from('batch_decompose_tasks')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)

    // 查 batch_question_bank 数量
    const { count: bankCount, error: bankErr } = await admin
      .from('batch_question_bank')
      .select('id', { count: 'exact', head: true })

    return res.status(200).json({
      success: true,
      teacher_decompose_tasks: {
        count: teacherTasks?.length ?? 0,
        error: tErr ? tErr.message : null,
        tasks: teacherTasks ?? [],
      },
      batch_decompose_tasks: {
        count: batchTasks?.length ?? 0,
        error: bErr ? bErr.message : null,
        tasks: batchTasks ?? [],
      },
      batch_question_bank_count: bankCount ?? 0,
      bank_error: bankErr ? bankErr.message : null,
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : '调试查询失败',
    })
  }
}

export const config = {
  maxDuration: 10,
}
