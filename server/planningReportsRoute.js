import { setNoCacheHeaders } from './apiResponse.js'
import { buildMonthlyReport, buildWeeklyReport } from './planning/planningReportsService.js'

export function registerPlanningReportsRoutes(app) {
  app.get('/api/planning/weekly-report', async (req, res) => {
    setNoCacheHeaders(res)
    const studentId =
      String(req.query.studentId || req.query.student_id || '').trim()
    const planId = String(req.query.planId || req.query.plan_id || '').trim() || undefined
    const weekStart = String(req.query.weekStart || req.query.week_start || '').trim() || undefined

    if (!studentId) {
      return res.status(400).json({ success: false, message: '缺少 studentId' })
    }

    try {
      const report = await buildWeeklyReport({ studentId, planId, weekStart })
      return res.json({ success: true, report })
    } catch (error) {
      console.error('[planning/weekly-report]', error)
      return res.status(400).json({
        success: false,
        message: error instanceof Error ? error.message : '生成周报失败',
      })
    }
  })

  app.get('/api/planning/monthly-report', async (req, res) => {
    setNoCacheHeaders(res)
    const studentId =
      String(req.query.studentId || req.query.student_id || '').trim()
    const planId = String(req.query.planId || req.query.plan_id || '').trim() || undefined
    const month = String(req.query.month || '').trim() || undefined

    if (!studentId) {
      return res.status(400).json({ success: false, message: '缺少 studentId' })
    }

    try {
      const report = await buildMonthlyReport({ studentId, planId, month })
      return res.json({ success: true, report })
    } catch (error) {
      console.error('[planning/monthly-report]', error)
      return res.status(400).json({
        success: false,
        message: error instanceof Error ? error.message : '生成月报失败',
      })
    }
  })
}
