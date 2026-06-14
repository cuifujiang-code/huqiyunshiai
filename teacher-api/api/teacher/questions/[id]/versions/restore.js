import '../../../../server/applyUrlShim.js'
import { handleTeacherApi } from '../../../teacherApiHandler.js'
import { applyApiHeaders, handleOptions } from '../../../../server/apiResponse.js'

export default async function handler(req, res) {
  if (handleOptions(req, res)) return
  applyApiHeaders(req, res)
  const id = req.query?.id
  if (!id) return res.status(400).json({ success: false, message: '缺少题目 id' })
  return handleTeacherApi(req, res, ['questions', String(id), 'versions', 'restore'])
}

export const config = { maxDuration: 60 }
