/**
 * Express entry for Tencent Cloud — 所有 /api 请求走 apiRouter 分发，不使用 Express 通配符
 * （Express 5 不支持 /api/batch/* 等裸 * 路径）
 */
import './server/applyUrlShim.js'
import express from 'express'
import dotenv from 'dotenv'
import { createServer } from 'http'
import { dispatchApiRequest } from './server/apiRouter.js'

dotenv.config()

const app = express()

app.use(express.json({ limit: '100mb' }))
app.use(express.raw({ limit: '100mb', type: 'application/octet-stream' }))
app.use(express.text({ limit: '100mb' }))
app.use(express.urlencoded({ extended: true, limit: '100mb' }))

app.use((req, res, next) => {
  const origin = req.headers.origin
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

  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }
  next()
})

/** 统一 API 入口（与 Vercel api/index + apiRouter 行为一致） */
app.use(async (req, res) => {
  const pathname = req.path || '/'

  if (pathname === '/api' && req.method === 'GET') {
    return res.status(200).json({
      status: 'ok',
      service: 'teacher-api',
      timestamp: new Date().toISOString(),
    })
  }

  if (!pathname.startsWith('/api/')) {
    return res.status(404).json({ success: false, message: 'Not found' })
  }

  try {
    await dispatchApiRequest(req, res)
  } catch (err) {
    console.error('[server] dispatch error:', err)
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: err instanceof Error ? err.message : '服务器错误',
      })
    }
  }
})

const PORT = Number(process.env.PORT) || 3001
createServer(app).listen(PORT, '0.0.0.0', () => {
  console.log('[server] Teacher API running on port', PORT)
})
