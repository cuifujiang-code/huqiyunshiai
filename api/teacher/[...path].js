import { handleTeacherApi } from '../../server/teacherApiHandler.js'
import { setNoCacheHeaders } from '../../server/apiResponse.js'

export default async function handler(req, res) {
  setNoCacheHeaders(res)
  const slug = req.query.path
  const segments = Array.isArray(slug) ? slug : slug ? [slug] : []
  return handleTeacherApi(req, res, segments)
}

export const config = {
  maxDuration: 60,
  api: { bodyParser: { sizeLimit: '50mb' } },
}
