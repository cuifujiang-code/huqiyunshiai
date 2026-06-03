import { handleAdminApi } from './adminHandler.js'
import { getPathSegmentsFromRequest } from '../urlUtil.js'

export function registerAdminRoutes(app) {
  app.use('/api/admin', async (req, res) => {
    const segments = getPathSegmentsFromRequest(req, '/api/admin')
    return handleAdminApi(req, res, segments)
  })
}
