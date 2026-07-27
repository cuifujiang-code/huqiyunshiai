import { generateDataDrivenPlan, lookupTargetUniversity } from '../teacher-api/server/planningEngine.js'
import {
  analyzeSubjectSelection,
  generateActionChecklist,
} from './planning/planningToolkitService.js'
import {
  resolvePlanningTargetFromBody,
  resolvePlanningProvince,
} from './planning/planningTargetResolve.js'

/**
 * POST /api/planning/generate — 数据驱动规划生成
 * POST /api/planning/university-lookup — 目标院校数据检索（生成前确认）
 * POST /api/planning/toolkit/subject-analysis — 选科辅助决策
 * POST /api/planning/toolkit/action-checklist — 90天行动清单
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
    const body = req.body ?? {}
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
      studentUserId,
      userId,
    } = body

    if (!studentName?.trim() || !grade || !scoreLevel) {
      return res.status(400).json({
        success: false,
        message: '请填写学生姓名、年级和成绩水平',
      })
    }

    const enhanced = _enhanced && typeof _enhanced === 'object' ? _enhanced : {}
    const uni =
      targetUniversity?.trim() ||
      confirmedUniversityData?.university?.trim() ||
      resolvePlanningTargetFromBody(body, enhanced)
    const province = resolvePlanningProvince(body, enhanced)
    const major =
      targetMajor?.trim() ||
      enhanced.targetMajor?.trim() ||
      body.targetMajorIntent?.trim() ||
      confirmedUniversityData?.major?.trim() ||
      '通用'

    if (!uni) {
      return res.status(400).json({
        success: false,
        message: '请选择期望院校层次或填写目标院校',
      })
    }
    if (!province) {
      return res.status(400).json({
        success: false,
        message: '请填写所在城市（需包含省份，如：浙江金华）',
      })
    }

    try {
      const form = {
        ...body,
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
        studentUserId: (studentUserId || userId || '').trim() || undefined,
        _planningEnrichment: body._planningEnrichment,
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
        reportSource: result.report?.source,
        universityLookup: result.lookup,
        dataSourceCitation: result.citation,
        fiveStagePlan: result.fiveStagePlan,
        orchestrationMeta: {
          providersUsed: result.meta?.providersUsed ?? ['planningEngine'],
          engine: 'planningEngine',
          dataSources: result.meta?.dataSources,
        },
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : '教育规划生成失败'
      return res.status(500).json({ success: false, message })
    }
  })

  app.post('/api/planning/toolkit/subject-analysis', async (req, res) => {
    const { scores } = req.body ?? {}
    if (!scores || typeof scores !== 'object') {
      return res.status(400).json({ success: false, message: '请提供各选科科目成绩' })
    }
    try {
      const result = await analyzeSubjectSelection(scores)
      return res.json(result)
    } catch (error) {
      const message = error instanceof Error ? error.message : '选科分析失败'
      return res.status(500).json({ success: false, message })
    }
  })

  app.post('/api/planning/toolkit/action-checklist', async (req, res) => {
    const { grade, goal, weakSubject, teacherId } = req.body ?? {}
    if (!grade || !goal || !weakSubject) {
      return res.status(400).json({ success: false, message: '请填写年级、主目标与薄弱科目' })
    }
    try {
      const result = await generateActionChecklist({ grade, goal, weakSubject, teacherId })
      return res.json(result)
    } catch (error) {
      const message = error instanceof Error ? error.message : '行动清单生成失败'
      return res.status(500).json({ success: false, message })
    }
  })
}
