/**
 * POST /api/teacher/questions/import — Excel 批量导入题目
 */
import '../../../server/applyUrlShim.js'
import { handleTeacherApi } from '../../teacherApiHandler.js'
import { applyApiHeaders, handleOptions } from '../../../server/apiResponse.js'

export default async function handler(req, res) {
  if (handleOptions(req, res)) return
  applyApiHeaders(req, res)
  console.log('[api/teacher/questions/import] 请求', { method: req.method, url: req.url })
  return handleTeacherApi(req, res, ['questions', 'import'])
}

export const config = {
  maxDuration: 120,
  api: { bodyParser: { sizeLimit: '50mb' } },
}
