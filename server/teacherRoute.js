import { handleTeacherApi } from './teacherApiHandler.js'
import { getPathSegmentsFromRequest } from './urlUtil.js'
import decomposeSubmit from '../api/teacher/decompose-submit.js'
import decomposeProcess from '../api/teacher/decompose-process.js'
import decomposeStatus from '../api/teacher/decompose-status.js'
import decomposeTasks from '../api/teacher/decompose-tasks.js'

export function registerTeacherRoutes(app) {
  app.post('/api/teacher/decompose-submit', (req, res) => decomposeSubmit(req, res))
  app.post('/api/teacher/decompose-process', (req, res) => decomposeProcess(req, res))
  app.get('/api/teacher/decompose-status', (req, res) => decomposeStatus(req, res))
  app.post('/api/teacher/decompose-status', (req, res) => decomposeStatus(req, res))
  app.get('/api/teacher/decompose-tasks', (req, res) => decomposeTasks(req, res))
  app.post('/api/teacher/decompose-tasks', (req, res) => decomposeTasks(req, res))

  app.use('/api/teacher', async (req, res) => {
    const segments = getPathSegmentsFromRequest(req, '/api/teacher')
    return handleTeacherApi(req, res, segments)
  })
}
