import { randomUUID } from 'crypto'
import { createDiagnosisTask, isDiagnosisTaskStoreConfigured } from '../../server/diagnosisTaskStore.js'
import { triggerDiagnosisProcess } from '../../server/diagnosisTrigger.js'

function buildPayload(body) {
  return {
    examType: body.examType,
    subject: body.subject,
    score: body.score,
    fullScore: body.fullScore,
    gradeRank: body.gradeRank,
    confusion: body.confusion?.trim() || '',
    examFileBase64: body.examFileBase64,
    examFileName: body.examFileName,
    answerImages: body.answerImages,
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' })
  }

  if (!isDiagnosisTaskStoreConfigured()) {
    return res.status(503).json({
      success: false,
      message: '诊断服务未配置 Supabase，请联系管理员配置 VITE_SUPABASE_URL 与 SUPABASE_SERVICE_ROLE_KEY',
    })
  }

  const body = req.body ?? {}
  const imageCount = Array.isArray(body.answerImages) ? body.answerImages.length : 0

  if (!body.examFileBase64 || !body.examFileName) {
    return res.status(400).json({ success: false, message: '请上传标准试卷（Word 或 PDF）' })
  }
  if (!imageCount) {
    return res.status(400).json({ success: false, message: '请至少上传一张学生答题卡图片' })
  }
  if (!body.examType || !body.subject || body.score == null) {
    return res.status(400).json({ success: false, message: '请填写考试类型、学科和分数' })
  }

  const taskId = randomUUID()
  const userId = body.userId?.trim() || null

  console.log('[api/diagnosis/submit] 创建任务', {
    taskId,
    userId,
    examFileName: body.examFileName,
    answerImageCount: imageCount,
  })

  try {
    await createDiagnosisTask({
      taskId,
      userId,
      payload: buildPayload(body),
    })

    triggerDiagnosisProcess(taskId)

    return res.status(200).json({
      success: true,
      taskId,
      status: 'processing',
      message: '您的诊断正在处理中，预计需要20-40秒...',
    })
  } catch (error) {
    console.error('[api/diagnosis/submit] 失败', error)
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : '提交诊断任务失败',
    })
  }
}
