/**
 * 显式路由：/api/teacher/questions（避免 questions/ 子目录导致 catch-all 失效）
 */
import '../../server/applyUrlShim.js'
import { handleTeacherApi } from '../teacherApiHandler.js'
import { applyApiHeaders, handleOptions } from '../../server/apiResponse.js'

export default async function handler(req, res) {
  if (handleOptions(req, res)) return
  applyApiHeaders(req, res)
  console.log('[api/teacher/questions] 请求', { method: req.method, url: req.url })
  return handleTeacherApi(req, res, ['questions'])
}

export const config = {
  maxDuration: 60,
  api: { bodyParser: { sizeLimit: '50mb' } },
}
