import '../../server/applyUrlShim.js'
import { runDiagnosisAnalysisStep } from '../../server/diagnosisProcessAnalysis.js'
import { verifyDiagnosisProcessSecret } from '../../server/diagnosisTrigger.js'
import { setNoCacheHeaders } from '../../server/apiResponse.js'

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

  console.log('[api/diagnosis/process-analysis] 开始', { taskId })

  try {
    const outcome = await runDiagnosisAnalysisStep(taskId)
    return res.status(200).json({ taskId, ...outcome })
  } catch (error) {
    console.error('[api/diagnosis/process-analysis] 未捕获错误', error)
    return res.status(500).json({
      success: false,
      taskId,
      status: 'failed',
      message: error instanceof Error ? error.message : 'AI 分析失败',
    })
  }
}

export const config = {
  maxDuration: 60,
}
