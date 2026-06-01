import '../../server/applyUrlShim.js'
import { applyApiHeaders, handleOptions } from '../../server/apiResponse.js'
import uploadHandler from './upload.js'
import startHandler from './start.js'
import progressHandler from './progress.js'
import healthHandler from './health.js'
import workerHandler from './worker.js'
import autoRetryHandler from './auto-retry.js'

import debugHandler from './debug.js'

const ROUTES = {
  upload: uploadHandler,
  start: startHandler,
  progress: progressHandler,
  health: healthHandler,
  worker: workerHandler,
  'auto-retry': autoRetryHandler,
  debug: debugHandler,
}

function resolveBatchSegment(req) {
  const rawPath = req.query?.path
  if (Array.isArray(rawPath)) return rawPath.join('/')
  if (typeof rawPath === 'string' && rawPath) return rawPath
  const url = req.url ?? ''
  const match = url.match(/\/api\/batch\/([^/?]+)/)
  return match?.[1] ?? ''
}

/** Vercel 嵌套路由兜底：/api/batch/upload | progress | health | start | worker | auto-retry */
export default async function handler(req, res) {
  if (handleOptions(req, res)) return
  applyApiHeaders(req, res)

  const segment = resolveBatchSegment(req)
  console.log('[api/batch] 路由', { url: req.url, segment, method: req.method })

  const routeHandler = ROUTES[segment]
  if (routeHandler) {
    return routeHandler(req, res)
  }

  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  return res.status(404).json({
    success: false,
    error: `未知 batch 路由: ${segment || '(空)'}`,
    questions: [],
    tasks: [],
  })
}

export const config = {
  maxDuration: 60,
  includeFiles: '{server/**,node_modules/mammoth/**,node_modules/pdf-parse/**,node_modules/pdfjs-dist/**}',
}
