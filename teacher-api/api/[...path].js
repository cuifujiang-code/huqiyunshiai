import '../server/applyUrlShim.js'
import { handleTeacherApi } from './teacherApiHandler.js'
import { applyApiHeaders, handleOptions } from '../server/apiResponse.js'
import { getPathSegmentsFromRequest } from '../server/urlUtil.js'

export default async function handler(req, res) {
  if (handleOptions(req, res)) return
  applyApiHeaders(req, res)

  const segments = getPathSegmentsFromRequest(req, '/api')
  return handleTeacherApi(req, res, segments)
}

export const config = {
  maxDuration: 60,
  api: { bodyParser: { sizeLimit: '50mb' } },
}
