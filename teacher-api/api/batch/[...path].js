import '../../server/applyUrlShim.js'
import { applyApiHeaders, handleOptions } from '../../server/apiResponse.js'
import progressHandler from './progress.js'

/** Vercel 嵌套路由兜底：/api/batch/progress → api/batch/[...path].js */
export default async function handler(req, res) {
  if (handleOptions(req, res)) return
  applyApiHeaders(req, res)

  const rawPath = req.query?.path
  const segment = Array.isArray(rawPath) ? rawPath[0] : rawPath

  console.log('[api/batch] 路由', { url: req.url, segment, method: req.method })

  if (segment === 'progress' || req.url?.includes('/progress')) {
    return progressHandler(req, res)
  }

  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  return res.status(404).json({
    success: false,
    error: `未知 batch 路由: ${segment ?? '(空)'}`,
    questions: [],
  })
}

export const config = {
  maxDuration: 10,
  includeFiles: 'server/**',
}
