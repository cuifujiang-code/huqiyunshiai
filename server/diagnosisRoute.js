import { buildMockDiagnosisReport } from './mockDiagnosisData.js'

export function registerDiagnosisRoute(app) {
  app.post('/api/diagnosis/generate', async (req, res) => {
    const { examType, subject, score, fullScore, gradeRank, confusion } = req.body ?? {}

    if (!examType || !subject || score == null) {
      return res.status(400).json({
        success: false,
        message: '请填写考试类型、学科和分数',
      })
    }

    await new Promise((r) => setTimeout(r, 500))

    const report = buildMockDiagnosisReport({
      score: Number(score),
      fullScore: Number(fullScore) || 100,
      gradeRank: gradeRank ? Number(gradeRank) : undefined,
      examType,
      subject,
      confusion,
    })

    return res.json({
      success: true,
      message: '诊断报告生成成功',
      report,
    })
  })
}
