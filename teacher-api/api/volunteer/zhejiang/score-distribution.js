import '../../../server/applyUrlShim.js'
import { applyApiHeaders, handleOptions } from '../../../server/apiResponse.js'
import volunteerApiHandler from '../../../server/batch/volunteerApi.js'

/** POST /api/volunteer/zhejiang/score-distribution */
export default async function handler(req, res) {
  if (handleOptions(req, res)) return
  applyApiHeaders(req, res)
  return volunteerApiHandler(req, res)
}
