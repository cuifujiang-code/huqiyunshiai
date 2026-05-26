import { generateExam } from './examGenerator.js'

/**
 * POST /api/generate-exam
 * 优先调用七牛云 AI 生成试卷，失败时降级为模拟数据
 */
export function registerGenerateExamRoute(app) {
  app.post('/api/generate-exam', async (req, res) => {
    const { subject, grade, difficulty, prompt } = req.body ?? {}

    if (!subject || !grade || !difficulty) {
      return res.status(400).json({
        success: false,
        message: '请提供学科、年级和难度参数',
      })
    }

    try {
      const result = await generateExam({
        prompt: prompt?.trim() || '',
        subject,
        grade,
        difficulty,
      })

      return res.json({
        success: true,
        message: result.message,
        exam: result.exam,
        isMockFallback: result.isMockFallback,
        meta: {
          prompt: prompt?.trim() || null,
          generatedAt: new Date().toISOString(),
          mode: result.exam.source ?? (result.isMockFallback ? 'mock' : 'ai'),
        },
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : '试卷生成失败'
      return res.status(500).json({ success: false, message })
    }
  })
}
