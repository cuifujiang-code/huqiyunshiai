import { generatePlanning } from '../../server/planningGenerator.js'
import { buildApiErrorPayload, buildMockFallbackPayload, setNoCacheHeaders } from '../../server/apiResponse.js'
import { getDeepSeekConfigSummary } from '../../server/deepseekClient.js'

export default async function handler(req, res) {
  setNoCacheHeaders(res)
  console.log('[api/planning/generate] 收到请求', {
    method: req.method,
    deepseekConfig: getDeepSeekConfigSummary(),
  })

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' })
  }

  const {
    studentName,
    grade,
    goalDirections,
    scoreLevel,
    interests,
    parentExpectations,
    specialNotes,
    createdByRole,
  } = req.body ?? {}

  if (!studentName?.trim() || !grade || !scoreLevel) {
    return res.status(400).json({
      success: false,
      message: '请填写学生姓名、年级和成绩水平',
      deepseekConfig: getDeepSeekConfigSummary(),
    })
  }

  try {
    const form = {
      studentName: studentName.trim(),
      grade,
      goalDirections: Array.isArray(goalDirections) ? goalDirections : [],
      scoreLevel,
      interests: Array.isArray(interests) ? interests : [],
      parentExpectations: parentExpectations?.trim() || '',
      specialNotes: specialNotes?.trim() || '',
      createdByRole: createdByRole === 'student' ? 'student' : 'teacher',
    }

    const result = await generatePlanning(form)

    if (result.isMockFallback) {
      return res.status(200).json(buildMockFallbackPayload(result))
    }

    return res.status(200).json({
      success: true,
      message: result.message,
      report: result.report,
      isMockFallback: false,
      errorDetail: null,
      deepseekConfig: getDeepSeekConfigSummary(),
    })
  } catch (error) {
    const payload = buildApiErrorPayload(error, '教育规划生成失败')
    return res.status(500).json(payload)
  }
}
