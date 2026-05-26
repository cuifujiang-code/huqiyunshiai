import { buildMockPressureExam } from '../data/mockExamData'
import type { GenerateExamResponse } from '../types/exam'

export async function fetchGenerateExam(body: {
  prompt: string
  subject: string
  grade: string
  difficulty: string
}): Promise<GenerateExamResponse> {
  try {
    const response = await fetch('/api/generate-exam', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    const contentType = response.headers.get('content-type') ?? ''
    const text = await response.text()

    if (contentType.includes('application/json') && text) {
      try {
        const data = JSON.parse(text) as GenerateExamResponse
        if (response.ok && data.success && data.exam) {
          return data
        }
      } catch {
        // 降级本地模拟
      }
    }
  } catch {
    // 网络错误或 Vercel 静态部署无后端，降级本地模拟
  }

  await new Promise((r) => setTimeout(r, 600))

  return {
    success: true,
    message: '试卷生成成功（演示模拟数据）',
    exam: buildMockPressureExam({
      subject: body.subject,
      grade: body.grade,
      difficulty: body.difficulty,
    }),
  }
}
