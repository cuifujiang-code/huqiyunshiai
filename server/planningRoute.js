import { generateDataDrivenPlan, lookupTargetUniversity } from '../teacher-api/server/planningEngine.js'

/**
 * POST /api/planning/generate — 数据驱动规划生成
 * POST /api/planning/university-lookup — 目标院校数据检索（生成前确认）
 */
export function registerPlanningRoute(app) {
  app.post('/api/planning/university-lookup', async (req, res) => {
    const { targetUniversity, province, major } = req.body ?? {}
    if (!targetUniversity?.trim() || !province?.trim()) {
      return res.status(400).json({
        success: false,
        message: '请提供目标院校与省份',
      })
    }
    try {
      const lookup = lookupTargetUniversity(
        targetUniversity.trim(),
        province.trim(),
        (major || '通用').trim(),
      )
      return res.json({ success: true, lookup })
    } catch (error) {
      const message = error instanceof Error ? error.message : '院校检索失败'
      return res.status(500).json({ success: false, message })
    }
  })

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
      _enhanced,
      targetUniversity,
      targetMajor,
      confirmedUniversityData,
    } = req.body ?? {}

    if (!studentName?.trim() || !grade || !scoreLevel) {
      return res.status(400).json({
        success: false,
        message: '请填写学生姓名、年级和成绩水平',
      })
    }

    const enhanced = _enhanced && typeof _enhanced === 'object' ? _enhanced : {}
    const uni =
      targetUniversity?.trim() ||
      enhanced.targetSchools?.[0]?.trim() ||
      confirmedUniversityData?.university?.trim() ||
      ''
    const province = enhanced.schoolInfo?.province?.trim() || ''
    const major =
      targetMajor?.trim() ||
      enhanced.targetMajor?.trim() ||
      confirmedUniversityData?.major?.trim() ||
      '通用'

    if (!uni) {
      return res.status(400).json({
        success: false,
        message: '请在目标学校中填写至少一所目标院校',
      })
    }
    if (!province) {
      return res.status(400).json({
        success: false,
        message: '请选择省份',
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
        _enhanced: enhanced,
        targetUniversity: uni,
        targetMajor: major,
      }

      const result = await generateDataDrivenPlan(uni, province, major, form)

      if (!result.success) {
        const status = result.error === 'EMPTY_DATA' ? 422 : 500
        return res.status(status).json({
          success: false,
          message: result.message,
          emptyDataRule: result.emptyDataRule,
          forbidAiHallucination: result.forbidAiHallucination,
        })
      }

      return res.json({
        success: true,
        message: `教育规划方案生成成功（数据驱动 · ${result.meta?.templateVersion ?? 'v2'}）`,
        report: result.report,
        isMockFallback: false,
        universityLookup: result.lookup,
        dataSourceCitation: result.citation,
        fiveStagePlan: result.fiveStagePlan,
        orchestrationMeta: {
          providersUsed: result.meta?.providersUsed ?? ['planningEngine'],
          engine: 'planningEngine',
        },
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : '教育规划生成失败'
      return res.status(500).json({ success: false, message })
    }
  })
}
