import { waitUntil } from '@vercel/functions'
import '../server/applyUrlShim.js'
import { runDecomposeTask } from '../server/teacher/decomposeProcess.js'
import { verifyDecomposeProcessSecret } from '../server/teacher/decomposeTrigger.js'
import { applyApiHeaders, handleOptions } from '../server/apiResponse.js'

export default async function handler(req, res) {
  if (handleOptions(req, res)) return
  applyApiHeaders(req, res)

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

  console.log('[decompose-process] 受理任务', { taskId })

  waitUntil(
    runDecomposeTask(taskId).catch((error) => {
      console.error('[decompose-process] 后台拆题失败', { taskId, error })
    }),
  )

  return res.status(202).json({
    success: true,
    taskId,
    status: 'processing',
    message: '拆题任务已受理，正在后台处理',
  })
}

export const config = {
  maxDuration: 60,
}
