import '../../server/applyUrlShim.js'
import { applyApiHeaders, handleOptions } from '../../server/apiResponse.js'
import { runBatchHealthChecks } from '../../server/batch/batchHealthCheck.js'

export default async function handler(req, res) {
  try {
    if (handleOptions(req, res)) return
    applyApiHeaders(req, res)
    res.setHeader('Content-Type', 'application/json; charset=utf-8')

    if (req.method !== 'GET') {
      return res.status(405).json({
        success: false,
        status: 'unhealthy',
        error: 'Method Not Allowed',
        checks: {},
        timestamp: new Date().toISOString(),
      })
    }

    console.log('[batch/health] 开始健康检查')
    const report = await runBatchHealthChecks(req)
    const httpStatus = report.status === 'healthy' ? 200 : report.status === 'degraded' ? 200 : 503

    console.log('[batch/health] 检查完成', {
      status: report.status,
      success: report.success,
      checks: Object.fromEntries(
        Object.entries(report.checks).map(([k, v]) => [k, { ok: v.ok, error: v.error }]),
      ),
    })

    return res.status(httpStatus).json(report)
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error)
    console.error('[batch/health] 未捕获异常', errMsg)
    return res.status(500).json({
      success: false,
      status: 'unhealthy',
      error: errMsg,
      checks: {},
      timestamp: new Date().toISOString(),
    })
  }
}

export const config = {
  maxDuration: 15,
  includeFiles: 'server/**',
}
