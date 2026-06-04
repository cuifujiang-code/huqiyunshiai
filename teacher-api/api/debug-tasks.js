import '../server/applyUrlShim.js'
import { createServiceRoleClient } from '../server/supabaseAdmin.js'
import { applyApiHeaders, handleOptions } from '../server/apiResponse.js'
import { verifyBatchWorkerSecret } from '../server/batch/batchTrigger.js'

export default async function handler(req, res) {
  if (handleOptions(req, res)) return
  applyApiHeaders(req, res)

  if (!verifyBatchWorkerSecret(req)) {
    return res.status(401).json({ success: false, message: '未授权：需要有效的 x-batch-worker-secret' })
  }

  try {
    const admin = createServiceRoleClient()
    const action = req.query?.action || req.body?.action || 'view'

    if (action === 'view') {
      const { data: teacherTasks, error: tErr } = await admin
        .from('teacher_decompose_tasks')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50)

      const { data: batchTasks, error: bErr } = await admin
        .from('batch_decompose_tasks')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50)

      const { count: bankCount } = await admin
        .from('batch_question_bank')
        .select('id', { count: 'exact', head: true })

      return res.status(200).json({
        success: true,
        teacher_decompose_tasks: { count: teacherTasks?.length ?? 0, tasks: teacherTasks ?? [] },
        batch_decompose_tasks: { count: batchTasks?.length ?? 0, tasks: batchTasks ?? [] },
        batch_question_bank_count: bankCount ?? 0,
      })
    }

    if (action === 'clean') {
      const confirm = req.query?.confirm === '1' || req.body?.confirm === '1'
      if (!confirm) {
        return res.status(400).json({
          success: false,
          message: '危险操作：clean 需传 confirm=1，且仅删除非 completed/running 且无题库数据的任务',
        })
      }

      const results = {}

      const { data: teacherTasks } = await admin
        .from('teacher_decompose_tasks')
        .select('task_id, status, result')
      const teacherToDelete = (teacherTasks ?? [])
        .filter((t) => {
          if (t.status === 'completed') return false
          const qCount = Array.isArray(t.result?.questions) ? t.result.questions.length : 0
          return qCount === 0
        })
        .map((t) => t.task_id)

      if (teacherToDelete.length > 0) {
        const { error: tdErr } = await admin
          .from('teacher_decompose_tasks')
          .delete()
          .in('task_id', teacherToDelete)
        results.teacher_deleted = { count: teacherToDelete.length, error: tdErr?.message }
      } else {
        results.teacher_deleted = { count: 0 }
      }

      const { data: batchTasks } = await admin
        .from('batch_decompose_tasks')
        .select('batch_id, status')
      const batchToDelete = (batchTasks ?? [])
        .filter((t) => t.status !== 'completed' && t.status !== 'running')
        .map((t) => t.batch_id)

      if (batchToDelete.length > 0) {
        const { error: itemsErr } = await admin
          .from('batch_decompose_items')
          .delete()
          .in('batch_id', batchToDelete)
        results.items_deleted = { count: batchToDelete.length, error: itemsErr?.message }

        const { error: btErr } = await admin
          .from('batch_decompose_tasks')
          .delete()
          .in('batch_id', batchToDelete)
        results.batch_deleted = { count: batchToDelete.length, error: btErr?.message }

        const { error: bankDelErr } = await admin
          .from('batch_question_bank')
          .delete()
          .in('batch_id', batchToDelete)
        results.bank_deleted = { count: batchToDelete.length, error: bankDelErr?.message }
      } else {
        results.batch_deleted = { count: 0 }
        results.bank_deleted = { count: 0 }
      }

      const { count: finalBankCount } = await admin
        .from('batch_question_bank')
        .select('id', { count: 'exact', head: true })
      const { data: finalBatchTasks } = await admin
        .from('batch_decompose_tasks')
        .select('batch_id, status, file_name')
      const { data: finalTeacherTasks } = await admin
        .from('teacher_decompose_tasks')
        .select('task_id, status')

      return res.status(200).json({
        success: true,
        action: 'clean',
        results,
        final_state: {
          teacher_decompose_tasks: finalTeacherTasks?.length ?? 0,
          batch_decompose_tasks: finalBatchTasks?.length ?? 0,
          batch_question_bank: finalBankCount ?? 0,
        },
      })
    }

    return res.status(400).json({ success: false, message: '未知 action，支持 view / clean' })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : '操作失败',
    })
  }
}

export const config = {
  maxDuration: 30,
}
