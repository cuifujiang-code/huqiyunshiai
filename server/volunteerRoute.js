/**
 * 本地开发 — 志愿填报 API 路由注册
 */
import volunteerApiHandler from '../teacher-api/server/batch/volunteerApi.js'

export function registerVolunteerRoutes(app) {
  app.all('/api/volunteer/generate', (req, res) => volunteerApiHandler(req, res))
  app.all('/api/volunteer/schemes', (req, res) => volunteerApiHandler(req, res))
  app.all('/api/volunteer/scheme/:id', (req, res) => volunteerApiHandler(req, res))
}
