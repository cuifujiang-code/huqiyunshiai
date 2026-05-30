/**
 * Teacher API 健康检查（根路径 / 经 vercel.json rewrite 指向此处）
 * 保持零依赖，避免 import 链导致冷启动失败返回空白页
 */
export default function handler(req, res) {
  try {
    const origin = req.headers?.origin
    const allowedOrigins = (
      process.env.TEACHER_API_ALLOWED_ORIGINS
      || 'https://huqiyunshiai.online,https://www.huqiyunshiai.online,http://localhost:5173,http://127.0.0.1:5173'
    ).split(',').map((s) => s.trim()).filter(Boolean)

    let allowOrigin = allowedOrigins[0] || '*'
    if (origin && allowedOrigins.includes(origin)) allowOrigin = origin
    if (origin && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) allowOrigin = origin

    res.setHeader('Access-Control-Allow-Origin', allowOrigin)
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-decompose-process-secret, x-batch-worker-secret')
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
    res.setHeader('Content-Type', 'application/json; charset=utf-8')

    if (req.method === 'OPTIONS') {
      return res.status(204).end()
    }

    return res.status(200).json({
      status: 'ok',
      message: 'Teacher API is running',
      service: 'teacher-api',
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : '健康检查异常'
    if (!res.headersSent) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      return res.status(500).json({ status: 'error', message, error: message })
    }
  }
}

export const config = {
  maxDuration: 10,
}
