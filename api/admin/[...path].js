import '../../server/applyUrlShim.js'
import { handleAdminApi } from '../../server/admin/adminHandler.js'
import { setNoCacheHeaders } from '../../server/apiResponse.js'

function getAdminPathSegments(req) {
  const params = req.query || {}
  const pathParam = params.path
  if (Array.isArray(pathParam)) return pathParam
  if (typeof pathParam === 'string' && pathParam) return pathParam.split('/').filter(Boolean)
  const url = req.url || ''
  const match = url.match(/\/api\/admin\/?(.*)$/)
  return match?.[1] ? match[1].split('?')[0].split('/').filter(Boolean) : []
}

export default async function handler(req, res) {
  setNoCacheHeaders(res)
  const segments = getAdminPathSegments(req)
  return handleAdminApi(req, res, segments)
}

export const config = {
  maxDuration: 30,
}
