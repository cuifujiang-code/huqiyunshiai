import batchRouter from '../api/batch/[...path].js'
import { handleTeacherApi } from '../api/teacherApiHandler.js'
import { getTeacherApiPathSegments } from './urlUtil.js'

function getRequestPathname(req) {
  if (typeof req.url !== 'string' || !req.url) return '/'
  try {
    const host = req.headers?.host || 'localhost'
    const proto = req.headers?.['x-forwarded-proto'] === 'https' ? 'https' : 'http'
    return new URL(req.url, `${proto}://${host}`).pathname
  } catch {
    return req.url.split('?')[0] || '/'
  }
}

function ensureBatchPathQuery(req) {
  const pathname = getRequestPathname(req)
  const match = pathname.match(/^\/api\/batch\/?([^/?]*)/)
  if (!match) return false
  const segment = match[1] || ''
  if (segment && !req.query?.path) {
    req.query = { ...(req.query ?? {}), path: segment }
  }
  return true
}

/** 将 /api/batch/*、/api/teacher/* 等嵌套路由分发到对应 handler（Vercel rewrite 兜底） */
export async function dispatchApiRequest(req, res) {
  const pathname = getRequestPathname(req)
  console.log('[apiRouter] 分发请求', { pathname, method: req.method, url: req.url })

  if (pathname.startsWith('/api/batch')) {
    ensureBatchPathQuery(req)
    return batchRouter(req, res)
  }

  const segments = getTeacherApiPathSegments(req)
  if (segments.length > 0) {
    return handleTeacherApi(req, res, segments)
  }

  return res.status(404).json({
    success: false,
    message: `未知 API 路由: ${pathname}`,
    batchId: null,
    tasks: [],
    questions: [],
  })
}
