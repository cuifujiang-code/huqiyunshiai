import { generateExam } from '../server/examGenerator.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' })
  }

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

    return res.status(200).json({
      success: true,
      message: result.message,
      exam: result.exam,
      isMockFallback: result.isMockFallback,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : '试卷生成失败'
    return res.status(500).json({ success: false, message })
  }
}
