import { buildMockPressureExam } from './mockExamData.js'

/**
 * POST /api/generate-exam
 * 接收学科、年级、难度，返回完整模拟试卷（暂不调用七牛云 AI）
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

    // 模拟 AI 生成耗时，便于前端展示加载状态
    await new Promise((resolve) => setTimeout(resolve, 600))

    const exam = buildMockPressureExam({ subject, grade, difficulty })

    return res.json({
      success: true,
      message: '试卷生成成功',
      exam,
      meta: {
        prompt: prompt?.trim() || null,
        generatedAt: new Date().toISOString(),
        mode: 'mock',
      },
    })
  })
}
