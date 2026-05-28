import '../../server/applyUrlShim.js'
import { runDiagnosisOcrStep } from '../../server/diagnosisProcessOcr.js'
import { verifyDiagnosisProcessSecret } from '../../server/diagnosisTrigger.js'
import { setNoCacheHeaders } from '../../server/apiResponse.js'

/** @deprecated 请使用 process-ocr + process-analysis 分步处理 */
export default async function handler(req, res) {
  setNoCacheHeaders(res)
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

  console.log('[api/diagnosis/process] 已弃用，转发至 process-ocr', { taskId })

  try {
    const outcome = await runDiagnosisOcrStep(taskId)
    return res.status(200).json({ taskId, ...outcome })
  } catch (error) {
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
