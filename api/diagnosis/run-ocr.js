import { runDiagnosisOcrStep } from '../../server/diagnosisProcessOcr.js'
import { OCR_ENDPOINT } from '../../server/alibabaOcrHttp.js'

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

  console.log('[OCR诊断] 使用endpoint:', OCR_ENDPOINT)
  console.log('[api/diagnosis/run-ocr] 开始', { taskId })

  try {
    const outcome = await runDiagnosisOcrStep(taskId)

    if (outcome.skipped && outcome.status === 'ocr_done') {
      return res.status(200).json({ success: true, taskId, status: 'ocr_done' })
    }

    if (!outcome.success) {
      return res.status(200).json({
        success: false,
        taskId,
        status: outcome.status || 'failed',
        message: outcome.message || 'OCR 识别失败',
      })
    }

    return res.status(200).json({ success: true, taskId, status: 'ocr_done' })
  } catch (error) {
    console.error('[api/diagnosis/run-ocr] 未捕获错误', error)
    return res.status(500).json({
      success: false,
      taskId,
      message: error instanceof Error ? error.message : 'OCR 处理失败',
    })
  }
}

export const config = {
  maxDuration: 10,
}
