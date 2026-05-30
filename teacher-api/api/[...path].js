import '../server/applyUrlShim.js'
import { applyApiHeaders, handleOptions } from '../server/apiResponse.js'
import { dispatchApiRequest } from '../server/apiRouter.js'

/** Vercel catch-all：/api/batch/*、/api/teacher/* 等嵌套路由 */
export default async function handler(req, res) {
  if (handleOptions(req, res)) return
  applyApiHeaders(req, res)
  return dispatchApiRequest(req, res)
}

export const config = {
  maxDuration: 60,
  includeFiles: '{server/**,node_modules/mammoth/**,node_modules/pdf-parse/**,node_modules/pdfjs-dist/**}',
}
