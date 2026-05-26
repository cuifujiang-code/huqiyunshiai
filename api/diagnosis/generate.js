import { generateDiagnosis } from '../server/diagnosisGenerator.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' })
  }

  const { examType, subject, score, fullScore, gradeRank, confusion } = req.body ?? {}

  if (!examType || !subject || score == null) {
    return res.status(400).json({
      success: false,
      message: '请填写考试类型、学科和分数',
    })
  }

  try {
    const form = {
      examType,
      subject,
      score: Number(score),
      fullScore: Number(fullScore) || 100,
      gradeRank: gradeRank != null ? Number(gradeRank) : undefined,
      confusion: confusion?.trim() || '',
    }

    const result = await generateDiagnosis(form)

    return res.status(200).json({
      success: true,
      message: result.message,
      report: result.report,
      isMockFallback: result.isMockFallback,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : '诊断报告生成失败'
    return res.status(500).json({ success: false, message })
  }
}
