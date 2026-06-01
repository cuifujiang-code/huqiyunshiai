import '../server/applyUrlShim.js'
import { createServiceRoleClient } from '../server/supabaseAdmin.js'
import { applyApiHeaders, handleOptions } from '../server/apiResponse.js'

// 有实际入库数据的 batch_id 白名单（保留，不删除）
const KEEP_BATCH_IDS = new Set([
  '7f97db19-0ca4-4e36-88af-ca175dacc679', // 光电效应.pdf: 4题入库
  '90366a65-58d1-4fc3-84f0-6d9a0fb22138', // 金丽衢十二校: 1题入库（最新）
])

export default async function handler(req, res) {
  if (handleOptions(req, res)) return
  applyApiHeaders(req, res)

  try {
    const admin = createServiceRoleClient()
    const action = req.query?.action || req.body?.action || 'view'

    // ====== VIEW MODE ======
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

    // ====== CLEAN MODE ======
    if (action === 'clean') {
      const results = {}

      // 1. 清理 teacher_decompose_tasks 中非 completed 且无实际入库的
      const { data: teacherTasks } = await admin
        .from('teacher_decompose_tasks')
        .select('task_id, status, result')
      const teacherToDelete = (teacherTasks ?? [])
        .filter(t => {
          // 保留 completed
          if (t.status === 'completed') return false
          // 保留有实际题目的
          const qCount = Array.isArray(t.result?.questions) ? t.result.questions.length : 0
          if (qCount > 0) return false
          return true
        })
        .map(t => t.task_id)

      if (teacherToDelete.length > 0) {
        const { error: tdErr } = await admin
          .from('teacher_decompose_tasks')
          .delete()
          .in('task_id', teacherToDelete)
        results.teacher_deleted = { count: teacherToDelete.length, ids: teacherToDelete, error: tdErr?.message }
      } else {
        results.teacher_deleted = { count: 0, ids: [] }
      }

      // 2. 清理 batch_decompose_tasks 中不在白名单的
      const { data: batchTasks } = await admin
        .from('batch_decompose_tasks')
        .select('batch_id, status')
      const batchToDelete = (batchTasks ?? [])
        .filter(t => !KEEP_BATCH_IDS.has(t.batch_id))
        .map(t => t.batch_id)

      if (batchToDelete.length > 0) {
        // 先删关联的 batch_decompose_items
        const { error: itemsErr } = await admin
          .from('batch_decompose_items')
          .delete()
          .in('batch_id', batchToDelete)
        results.items_deleted = { count: batchToDelete.length, error: itemsErr?.message }

        // 再删 batch_decompose_tasks
        const { error: btErr } = await admin
          .from('batch_decompose_tasks')
          .delete()
          .in('batch_id', batchToDelete)
        results.batch_deleted = { count: batchToDelete.length, ids: batchToDelete, error: btErr?.message }
      } else {
        results.batch_deleted = { count: 0, ids: [] }
      }

      // 3. 保留的 batch_question_bank（只保留白名单 batch_id 的题目）
      const { data: bankData } = await admin
        .from('batch_question_bank')
        .select('id, batch_id')
      const bankToDelete = (bankData ?? [])
        .filter(q => !KEEP_BATCH_IDS.has(q.batch_id))
        .map(q => q.id)

      if (bankToDelete.length > 0) {
        const { error: bankDelErr } = await admin
          .from('batch_question_bank')
          .delete()
          .in('id', bankToDelete)
        results.bank_deleted = { count: bankToDelete.length, error: bankDelErr?.message }
      } else {
        results.bank_deleted = { count: 0 }
      }

      // 最终统计
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
          kept_batch_ids: [...KEEP_BATCH_IDS],
        },
      })
    }

    return res.status(400).json({ success: false, message: '未知 action，支持 view / clean' })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : '操作失败',
      stack: error instanceof Error ? error.stack : undefined,
    })
  }
}

export const config = {
  maxDuration: 30,
}
