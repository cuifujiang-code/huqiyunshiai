/**
 * 显式路由：/api/teacher/questions
 * Vercel 在存在 api/teacher/questions/ 子目录时，catch-all [...path].js 不会匹配本路径，导致回退 SPA。
 */
import '../../server/applyUrlShim.js'
import { handleTeacherApi } from '../../server/teacherApiHandler.js'
import { applyApiHeaders, handleOptions, setNoCacheHeaders } from '../../server/apiResponse.js'

export default async function handler(req, res) {
  if (handleOptions(req, res)) return
  applyApiHeaders(req, res)
  setNoCacheHeaders(res)
  console.log('[api/teacher/questions] 请求', { method: req.method, url: req.url })
  return handleTeacherApi(req, res, ['questions'])
}

export const config = {
  maxDuration: 60,
  api: { bodyParser: { sizeLimit: '50mb' } },
}
