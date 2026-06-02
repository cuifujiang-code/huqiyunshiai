import '../../server/applyUrlShim.js'
import { applyApiHeaders, handleOptions } from '../../server/apiResponse.js'
import { handleCatalogRequest } from '../../server/batch/catalogApi.js'

/** Vercel 嵌套路由：/api/catalog/* */
export default async function handler(req, res) {
  if (handleOptions(req, res)) return
  applyApiHeaders(req, res)
  return handleCatalogRequest(req, res)
}

export const config = {
  maxDuration: 30,
  includeFiles: 'server/**',
}
