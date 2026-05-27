import { randomUUID } from 'crypto'
import {
  createDecomposeTask,
  getDecomposeTaskByTaskId,
  isDecomposeTaskStoreConfigured,
} from '../../server/teacher/decomposeTaskStore.js'
import { triggerDecomposeProcess } from '../../server/teacher/decomposeTrigger.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' })
  }

  if (!isDecomposeTaskStoreConfigured()) {
    return res.status(503).json({
      success: false,
      message: '请配置 VITE_SUPABASE_URL 与 SUPABASE_SERVICE_ROLE_KEY',
    })
  }

  const body = req.body ?? {}
  const { examFileBase64, examFileName, teacherId, subject, grade } = body

  if (!examFileBase64 || !examFileName) {
    return res.status(400).json({ success: false, message: '请上传试卷文件' })
  }
  if (!teacherId) {
    return res.status(400).json({ success: false, message: '缺少 teacherId' })
  }

  const taskId = randomUUID()

  try {
    await createDecomposeTask({
      taskId,
      teacherId,
      payload: {
        examFileBase64,
        examFileName,
        subject: subject || '物理',
        grade: grade || '八年级',
      },
    })

    triggerDecomposeProcess(taskId)

    return res.status(200).json({
      success: true,
      taskId,
      status: 'processing',
      message: '拆题任务已提交',
    })
  } catch (error) {
    console.error('[decompose-submit] 失败', error)
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : '提交拆题任务失败',
    })
  }
}

export const config = {
  maxDuration: 10,
}
