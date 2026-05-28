import { getDiagnosisJob } from '../../server/diagnosisJobs.js'
import { buildMockFallbackPayload, setNoCacheHeaders } from '../../server/apiResponse.js'

export default async function handler(req, res) {
  setNoCacheHeaders(res)
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' })
  }

  const jobId = req.query?.jobId
  if (!jobId || typeof jobId !== 'string') {
    return res.status(400).json({ success: false, message: '缺少 jobId 参数' })
  }

  const job = getDiagnosisJob(jobId)
  if (!job) {
    return res.status(404).json({ success: false, status: 'not_found', message: '任务不存在或已过期' })
  }

  if (job.status === 'processing') {
    return res.status(200).json({
      success: true,
      status: 'processing',
      jobId,
      message: '正在上传并分析试卷...',
    })
  }

  if (job.status === 'failed') {
    return res.status(200).json({
      success: false,
      status: 'failed',
      jobId,
      message: job.error || '诊断任务失败',
    })
  }

  const result = job.result
  if (result?.isMockFallback) {
    return res.status(200).json({
      ...buildMockFallbackPayload(result),
      async: true,
      jobId,
      status: 'done',
    })
  }

  return res.status(200).json({
    success: true,
    status: 'done',
    jobId,
    message: result?.message,
    report: result?.report,
    isMockFallback: false,
    errorDetail: null,
  })
}
