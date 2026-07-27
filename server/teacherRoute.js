import { handleTeacherApi } from './teacherApiHandler.js'
import { getPathSegmentsFromRequest } from './urlUtil.js'
import decomposeSubmit from '../api/teacher/decompose-submit.js'
import decomposeProcess from '../api/teacher/decompose-process.js'
import decomposeStatus from '../api/teacher/decompose-status.js'
import decomposeTasks from '../api/teacher/decompose-tasks.js'
import { handleQuestionImageRequest } from './questionImageRoute.js'
import handleDocxImport from '../teacher-api/api/teacher/book/docx-import.js'
import handleDocxCleanChapters from '../teacher-api/api/teacher/book/docx-clean-chapters.js'

export function registerTeacherRoutes(app) {
  const bindDecompose = (path, handler) => {
    app.post(path, (req, res) => handler(req, res))
    app.get(path, (req, res) => handler(req, res))
  }

  app.post('/api/teacher/decompose-submit', (req, res) => decomposeSubmit(req, res))
  app.post('/api/teacher/decompose-process', (req, res) => decomposeProcess(req, res))
  app.get('/api/teacher/decompose-status', (req, res) => decomposeStatus(req, res))
  app.post('/api/teacher/decompose-status', (req, res) => decomposeStatus(req, res))
  app.get('/api/teacher/decompose-tasks', (req, res) => decomposeTasks(req, res))
  app.post('/api/teacher/decompose-tasks', (req, res) => decomposeTasks(req, res))

  // 与 teacher-api / 前端 buildTeacherDecomposeApiUrl 对齐（/api/decompose-*）
  app.post('/api/decompose-submit', (req, res) => decomposeSubmit(req, res))
  app.post('/api/decompose-process', (req, res) => decomposeProcess(req, res))
  bindDecompose('/api/decompose-status', decomposeStatus)
  bindDecompose('/api/decompose-tasks', decomposeTasks)

  app.get('/api/teacher/question-images', (req, res) => handleQuestionImageRequest(req, res))
  app.post('/api/teacher/book/docx-import', (req, res) => handleDocxImport(req, res))
  app.post('/api/teacher/book/docx-clean-chapters', (req, res) => handleDocxCleanChapters(req, res))

  app.use('/api/teacher', async (req, res) => {
    const segments = getPathSegmentsFromRequest(req, '/api/teacher')
    return handleTeacherApi(req, res, segments)
  })
}
