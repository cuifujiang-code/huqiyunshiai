import { generatePlanning } from './planningGenerator.js'

/**
 * POST /api/planning/generate
 * 优先调用 DeepSeek AI 生成教育规划，失败时降级为模拟数据
 */
export function registerPlanningRoute(app) {
  app.post('/api/planning/generate', async (req, res) => {
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

      return res.json({
        success: true,
        message: result.message,
        report: result.report,
        isMockFallback: result.isMockFallback,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : '教育规划生成失败'
      return res.status(500).json({ success: false, message })
    }
  })
}
