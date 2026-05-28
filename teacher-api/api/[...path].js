import '../server/applyUrlShim.js'
import { handleTeacherApi } from './teacherApiHandler.js'
import { applyApiHeaders, handleOptions } from '../server/apiResponse.js'
import { getTeacherApiPathSegments } from '../server/urlUtil.js'

export default async function handler(req, res) {
  if (handleOptions(req, res)) return
  applyApiHeaders(req, res)

  const segments = getTeacherApiPathSegments(req)
  return handleTeacherApi(req, res, segments)
}

export const config = {
  maxDuration: 60,
  api: { bodyParser: { sizeLimit: '50mb' } },
}
