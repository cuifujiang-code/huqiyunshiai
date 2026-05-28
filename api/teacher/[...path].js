import '../../server/applyUrlShim.js'
import { handleTeacherApi } from '../../server/teacherApiHandler.js'
import { setNoCacheHeaders } from '../../server/apiResponse.js'
import { getTeacherApiPathSegments } from '../../server/urlUtil.js'

export default async function handler(req, res) {
  setNoCacheHeaders(res)
  const segments = getTeacherApiPathSegments(req)
  return handleTeacherApi(req, res, segments)
}

export const config = {
  maxDuration: 60,
  api: { bodyParser: { sizeLimit: '50mb' } },
}
