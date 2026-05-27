import { runDiagnosisAnalysisStep } from '../../server/diagnosisProcessAnalysis.js'

function getTaskId(req) {
  return req.query?.taskId || req.body?.taskId
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' })
  }

  const taskId = getTaskId(req)
  if (!taskId || typeof taskId !== 'string') {
    return res.status(400).json({ success: false, message: '缺少 taskId 参数' })
  }

  console.log('[api/diagnosis/run-analysis] 开始', { taskId })

  try {
    const outcome = await runDiagnosisAnalysisStep(taskId)

    if (outcome.skipped && outcome.status === 'completed') {
      const stored = outcome.result
      return res.status(200).json({
        success: true,
        taskId,
        status: 'completed',
        message: stored?.message,
        report: stored?.report,
        isMockFallback: stored?.isMockFallback ?? false,
      })
    }

    if (!outcome.success) {
      return res.status(200).json({
        success: false,
        taskId,
        status: outcome.status || 'failed',
        message: outcome.message || 'AI 分析失败',
      })
    }

    const stored = outcome.result || {}
    return res.status(200).json({
      success: true,
      taskId,
      status: 'completed',
      message: stored.message,
      report: stored.report,
      isMockFallback: stored.isMockFallback ?? false,
      errorDetail: stored.errorDetail ?? null,
    })
  } catch (error) {
    console.error('[api/diagnosis/run-analysis] 未捕获错误', error)
    return res.status(500).json({
      success: false,
      taskId,
      message: error instanceof Error ? error.message : 'AI 分析失败',
    })
  }
}

export const config = {
  maxDuration: 10,
}
