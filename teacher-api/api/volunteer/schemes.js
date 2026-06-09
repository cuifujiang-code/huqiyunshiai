import '../../server/applyUrlShim.js'
import { applyApiHeaders, handleOptions } from '../../server/apiResponse.js'
import volunteerApiHandler from '../../server/batch/volunteerApi.js'

/** GET /api/volunteer/schemes */
export default async function handler(req, res) {
  if (handleOptions(req, res)) return
  applyApiHeaders(req, res)
  return volunteerApiHandler(req, res)
}

export const config = { maxDuration: 60 }
