import { runDiagnosisTask } from '../../server/diagnosisProcess.js'
import { verifyDiagnosisProcessSecret } from '../../server/diagnosisTrigger.js'
import { OCR_ENDPOINT } from '../../server/alibabaOcrHttp.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' })
  }

  if (!verifyDiagnosisProcessSecret(req)) {
    return res.status(401).json({ success: false, message: 'Unauthorized' })
  }

  const taskId = req.body?.taskId
  if (!taskId || typeof taskId !== 'string') {
    return res.status(400).json({ success: false, message: '缺少 taskId' })
  }

  console.log('[OCR诊断] 使用endpoint:', OCR_ENDPOINT)
  console.log('[api/diagnosis/process] 开始', { taskId })

  try {
    const outcome = await runDiagnosisTask(taskId)
    return res.status(200).json({
      success: outcome.status === 'completed' || outcome.skipped,
      taskId,
      ...outcome,
    })
  } catch (error) {
    console.error('[api/diagnosis/process] 未捕获错误', error)
    return res.status(500).json({
      success: false,
      taskId,
      status: 'failed',
      message: error instanceof Error ? error.message : '后台处理失败',
    })
  }
}

export const config = {
  maxDuration: 60,
}
