import '../../../../server/applyUrlShim.js'
import { handleTeacherApi } from '../../../../server/teacherApiHandler.js'
import { applyApiHeaders, handleOptions, setNoCacheHeaders } from '../../../../server/apiResponse.js'

export default async function handler(req, res) {
  if (handleOptions(req, res)) return
  applyApiHeaders(req, res)
  setNoCacheHeaders(res)
  const id = req.query?.id
  if (!id) return res.status(400).json({ success: false, message: '缺少题目 id' })
  return handleTeacherApi(req, res, ['questions', String(id), 'versions', 'restore'])
}

export const config = { maxDuration: 60 }
