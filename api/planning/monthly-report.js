import '../../server/applyUrlShim.js'
import { setNoCacheHeaders } from '../../server/apiResponse.js'
import { buildMonthlyReport } from '../../server/planning/planningReportsService.js'

export default async function handler(req, res) {
  setNoCacheHeaders(res)
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' })
  }

  const studentId = String(req.query.studentId || req.query.student_id || '').trim()
  const planId = String(req.query.planId || req.query.plan_id || '').trim() || undefined
  const month = String(req.query.month || '').trim() || undefined

  if (!studentId) {
    return res.status(400).json({ success: false, message: '缺少 studentId' })
  }

  try {
    const report = await buildMonthlyReport({ studentId, planId, month })
    return res.status(200).json({ success: true, report })
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : '生成月报失败',
    })
  }
}

export const config = { maxDuration: 30 }
