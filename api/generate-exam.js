import { generateExam } from '../server/examGenerator.js'
import { buildApiErrorPayload, buildMockFallbackPayload } from '../server/apiResponse.js'
import { getDeepSeekConfigSummary } from '../server/deepseekClient.js'

export default async function handler(req, res) {
  console.log('[api/generate-exam] 收到请求', {
    method: req.method,
    deepseekConfig: getDeepSeekConfigSummary(),
  })

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' })
  }

  const { subject, grade, difficulty, prompt } = req.body ?? {}

  if (!subject || !grade || !difficulty) {
    return res.status(400).json({
      success: false,
      message: '请提供学科、年级和难度参数',
      deepseekConfig: getDeepSeekConfigSummary(),
    })
  }

  try {
    const result = await generateExam({
      prompt: prompt?.trim() || '',
      subject,
      grade,
      difficulty,
    })

    if (result.isMockFallback) {
      return res.status(200).json(buildMockFallbackPayload(result))
    }

    return res.status(200).json({
      success: true,
      message: result.message,
      exam: result.exam,
      isMockFallback: false,
      errorDetail: null,
      deepseekConfig: getDeepSeekConfigSummary(),
    })
  } catch (error) {
    const payload = buildApiErrorPayload(error, '试卷生成失败')
    return res.status(500).json(payload)
  }
}
