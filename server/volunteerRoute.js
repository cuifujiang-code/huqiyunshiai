/**
 * 本地开发 — 志愿填报 API 路由（含浙江扩展）
 */
import volunteerApiHandler from '../teacher-api/server/batch/volunteerApi.js'

export function registerVolunteerRoutes(app) {
  app.all(/^\/api\/volunteer(\/.*)?$/, (req, res) => volunteerApiHandler(req, res))
}
