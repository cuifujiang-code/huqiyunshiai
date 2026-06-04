/**
 * Express server entry for Tencent Cloud deployment
 * Replaces Vercel serverless functions with traditional HTTP server
 */
import express from 'express'
import dotenv from 'dotenv'
import { createServer } from 'http'

dotenv.config()

const app = express()

// Body parsers — support large file uploads (exam papers)
app.use(express.json({ limit: '100mb' }))
app.use(express.raw({ limit: '100mb', type: 'application/octet-stream' }))
app.use(express.text({ limit: '100mb' }))
app.use(express.urlencoded({ extended: true, limit: '100mb' }))

// CORS
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

// Lazy load handlers with error isolation
const handlers = {}
async function loadHandler(name, importPath) {
  if (handlers[name]) return handlers[name]
  try {
    const mod = await import(importPath)
    handlers[name] = mod.default || mod
    console.log('[server] Loaded handler:', name)
    return handlers[name]
  } catch (err) {
    console.error('[server] Failed to load', name, ':', err.message)
    return null
  }
}

function wrap(handlerFn) {
  return async (req, res) => {
    try {
      await handlerFn(req, res)
    } catch (err) {
      console.error('[server] Handler error:', err)
      if (!res.headersSent) {
        res.status(500).json({ success: false, message: err.message || '服务器错误' })
      }
    }
  }
}

// Express 5 / path-to-regexp v8：禁止裸 `*`，需具名通配如 `*splat` 或显式路径
const BATCH_SEGMENTS = ['upload', 'start', 'progress', 'health', 'worker', 'auto-retry', 'debug']

function mountCatchAll(pattern, handler) {
  app.all(pattern, wrap(handler))
}

// Mount all routes
async function startServer() {
  // ===== Batch routes =====
  const batchRouter = await loadHandler('batch', './api/batch/[...path].js')
  if (batchRouter) {
    for (const segment of BATCH_SEGMENTS) {
      app.all(`/api/batch/${segment}`, wrap(batchRouter))
    }
  }

  // ===== Teacher routes (explicit before catch-all) =====
  const teacherQuestions = await loadHandler('teacherQuestions', './api/teacher/questions.js')
  if (teacherQuestions) app.all('/api/teacher/questions', wrap(teacherQuestions))

  // Teacher question by ID — simulate Vercel [id].js dynamic route
  const teacherQuestionById = await loadHandler('teacherQuestionById', './api/teacher/questions/[id].js')
  if (teacherQuestionById) {
    app.all('/api/teacher/questions/:id', (req, res) => {
      req.query = { ...(req.query || {}), id: req.params.id }
      teacherQuestionById(req, res)
    })
  }

  // Teacher catch-all（Express 5: *splat）
  const teacherRouter = await loadHandler('teacher', './api/teacher/[...path].js')
  if (teacherRouter) mountCatchAll('/api/teacher/*splat', teacherRouter)

  // ===== Catalog routes =====
  const catalogRouter = await loadHandler('catalog', './api/catalog/[...path].js')
  if (catalogRouter) mountCatchAll('/api/catalog/*splat', catalogRouter)

  // ===== Decompose routes =====
  const decomposeSubmit = await loadHandler('decomposeSubmit', './api/decompose-submit.js')
  if (decomposeSubmit) app.all('/api/decompose-submit', wrap(decomposeSubmit))

  const decomposeStatus = await loadHandler('decomposeStatus', './api/decompose-status.js')
  if (decomposeStatus) app.all('/api/decompose-status', wrap(decomposeStatus))

  const decomposeTasks = await loadHandler('decomposeTasks', './api/decompose-tasks.js')
  if (decomposeTasks) app.all('/api/decompose-tasks', wrap(decomposeTasks))

  const decomposeProcess = await loadHandler('decomposeProcess', './api/decompose-process.js')
  if (decomposeProcess) app.all('/api/decompose-process', wrap(decomposeProcess))

  const debugTasks = await loadHandler('debugTasks', './api/debug-tasks.js')
  if (debugTasks) app.all('/api/debug-tasks', wrap(debugTasks))

  // ===== AI orchestrate =====
  const aiOrchestrate = await loadHandler('aiOrchestrate', './api/ai/orchestrate.js')
  if (aiOrchestrate) app.all('/api/ai/orchestrate', wrap(aiOrchestrate))

  // ===== Student photo search =====
  const photoSearch = await loadHandler('photoSearch', './api/student/photo-search.js')
  if (photoSearch) app.all('/api/student/photo-search', wrap(photoSearch))

  // ===== Root health =====
  app.get('/api', (req, res) => {
    res.json({ status: 'ok', service: 'teacher-api', timestamp: new Date().toISOString() })
  })

  // ===== 404 fallback（勿使用 /api/*，Express 5 会抛 path-to-regexp 错误）=====
  app.use((req, res) => {
    if (!req.path.startsWith('/api/') && req.path !== '/api') {
      res.status(404).json({ success: false, message: 'Not found' })
      return
    }
    res.status(404).json({ success: false, message: `API 路由未找到: ${req.path}` })
  })

  const PORT = process.env.PORT || 3001
  createServer(app).listen(PORT, () => {
    console.log('[server] Teacher API running on port', PORT)
  })
}

startServer().catch((err) => {
  console.error('[server] Failed to start:', err)
  process.exit(1)
})
