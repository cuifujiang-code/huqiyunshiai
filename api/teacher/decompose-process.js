import { runDecomposeTask } from '../../server/teacher/decomposeProcess.js'
import { verifyDecomposeProcessSecret } from '../../server/teacher/decomposeTrigger.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' })
  }

  if (!verifyDecomposeProcessSecret(req)) {
    return res.status(401).json({ success: false, message: 'Unauthorized' })
  }

  const taskId = req.body?.taskId
  if (!taskId) {
    return res.status(400).json({ success: false, message: '缺少 taskId' })
  }

  console.log('[decompose-process] 开始', { taskId })

  try {
    const outcome = await runDecomposeTask(taskId)
    return res.status(200).json({ taskId, ...outcome })
  } catch (error) {
    console.error('[decompose-process] 未捕获错误', error)
    return res.status(500).json({
      success: false,
      taskId,
      status: 'failed',
      message: error instanceof Error ? error.message : '拆题处理失败',
    })
  }
}

export const config = {
  maxDuration: 10,
}
