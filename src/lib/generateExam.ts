import { buildMockPressureExam } from '../data/mockExamData'
import type { GenerateExamResponse } from '../types/exam'

const MOCK_FALLBACK_MESSAGE = 'AI服务暂不可用，已展示示例试卷'

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
          return {
            ...data,
            isMockFallback: data.isMockFallback ?? data.exam.source === 'mock',
            message: data.isMockFallback ? MOCK_FALLBACK_MESSAGE : data.message,
          }
        }
      } catch {
        // 降级本地模拟
      }
    }
  } catch {
    // 网络错误，降级本地模拟
  }

  await new Promise((r) => setTimeout(r, 600))

  return {
    success: true,
    message: MOCK_FALLBACK_MESSAGE,
    isMockFallback: true,
    exam: buildMockPressureExam({
      subject: body.subject,
      grade: body.grade,
      difficulty: body.difficulty,
    }),
  }
}
