import { handleTeacherApi } from './teacherApiHandler.js'

export function registerTeacherRoutes(app) {
  app.use('/api/teacher', async (req, res) => {
    const segments = req.path.replace(/^\//, '').split('/').filter(Boolean)
    return handleTeacherApi(req, res, segments)
  })
}
