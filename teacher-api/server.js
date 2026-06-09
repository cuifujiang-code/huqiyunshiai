/**
 * Express entry for Tencent Cloud
 * 零通配符、零 apiRouter 依赖 — 每个 handler 独立 try-catch 导入
 * 导入失败的 handler → 返回 503，不影响其他路由
 */
import './server/applyUrlShim.js'
import express from 'express'
import dotenv from 'dotenv'
import { createServer } from 'http'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootEnvLocal = join(__dirname, '..', '.env.local')

dotenv.config({ path: rootEnvLocal, override: true })
dotenv.config({ path: '.env.local', override: true })
dotenv.config()

const app = express()

app.use(express.json({ limit: '100mb' }))
app.use(express.raw({ limit: '100mb', type: 'application/octet-stream' }))
app.use(express.text({ limit: '100mb' }))
app.use(express.urlencoded({ extended: true, limit: '100mb' }))

// CORS
app.use((req, res, next) => {
  const origin = req.headers.origin
  const allowedOrigins = (process.env.TEACHER_API_ALLOWED_ORIGINS
    || 'https://huqiyunshiai.online,https://www.huqiyunshiai.online,http://localhost:5173,http://127.0.0.1:5173'
  ).split(',').map(s => s.trim()).filter(Boolean)

  let allowOrigin = allowedOrigins[0] || '*'
  if (origin && allowedOrigins.includes(origin)) allowOrigin = origin
  if (origin && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) allowOrigin = origin

  res.setHeader('Access-Control-Allow-Origin', allowOrigin)
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-decompose-process-secret, x-batch-worker-secret, x-ai-orchestrate-secret')
  if (req.method === 'OPTIONS') { res.status(204).end(); return }
  next()
})

// ─── 安全导入每个 handler（失败 = stub 503） ───
async function safeImport(importPath, label) {
  try {
    const mod = await import(importPath)
    console.log('[server] ✓ Loaded:', label)
    return mod.default || mod
  } catch (err) {
    console.error('[server] ✗ Failed to load:', label, '-', String(err.message || err).slice(0, 100))
    return (req, res) => {
      res.status(503).json({ success: false, message: 'Handler not available: ' + label })
    }
  }
}

// ─── 顺序加载所有 handler ───
const batchRouter = await safeImport('./api/batch/[...path].js', 'batch catch-all')
const batchHealth = await safeImport('./api/batch/health.js', 'batch/health')
const teacherCatchAll = await safeImport('./api/teacher/[...path].js', 'teacher catch-all')
const teacherQuestionsList = await safeImport('./api/teacher/questions.js', 'teacher/questions')
const teacherQuestionsById = await safeImport('./api/teacher/questions/[id].js', 'teacher/questions/[id]')
const decomposeSubmit = await safeImport('./api/decompose-submit.js', 'decompose-submit')
const decomposeStatus = await safeImport('./api/decompose-status.js', 'decompose-status')
const decomposeTasks = await safeImport('./api/decompose-tasks.js', 'decompose-tasks')
const decomposeProcess = await safeImport('./api/decompose-process.js', 'decompose-process')
const debugTasks = await safeImport('./api/debug-tasks.js', 'debug-tasks')
const aiOrchestrate = await safeImport('./api/ai/orchestrate.js', 'ai/orchestrate')
const photoSearch = await safeImport('./api/student/photo-search.js', 'student/photo-search')
const volunteerApi = await safeImport('./server/batch/volunteerApi.js', 'volunteer')
const handwritingHandout = await safeImport('./api/ocr/handwriting-to-handout.js', 'ocr/handwriting-to-handout')
const handoutOcrProcess = await safeImport('./api/handouts/ocr-process.js', 'handouts/ocr-process')
const catalogRouter = await safeImport('./api/catalog/[...path].js', 'catalog catch-all')

// ─── 注册路由 ───

// GET /api 与根路径（Nginx 健康检查、apiRoot 自检）
const healthPayload = () => ({
  status: 'ok',
  service: 'teacher-api',
  timestamp: new Date().toISOString(),
})
app.get('/api', (req, res) => {
  res.json(healthPayload())
})
app.get('/', (req, res) => {
  res.json(healthPayload())
})

// batch/* — single handler handles all sub-routes via req.query.path
app.all('/api/batch/upload', batchRouter)
app.all('/api/batch/start', batchRouter)
app.all('/api/batch/progress', batchRouter)
app.all('/api/batch/health', batchHealth)
app.all('/api/batch/worker', batchRouter)
app.all('/api/batch/auto-retry', batchRouter)
app.all('/api/batch/debug', batchRouter)

// teacher（显式 questions，其余走 catch-all handler，不用 Express 通配符）
app.all('/api/teacher/questions/:id', teacherQuestionsById)
app.all('/api/teacher/questions', teacherQuestionsList)
app.use((req, res, next) => {
  const p = req.path || ''
  if (!p.startsWith('/api/teacher/')) return next()
  if (p === '/api/teacher/questions' || p.startsWith('/api/teacher/questions/')) return next()
  return teacherCatchAll(req, res)
})

// decompose-*
app.all('/api/decompose-submit', decomposeSubmit)
app.all('/api/decompose-status', decomposeStatus)
app.all('/api/decompose-tasks', decomposeTasks)
app.all('/api/decompose-process', decomposeProcess)
app.all('/api/debug-tasks', debugTasks)

// catalog
app.use((req, res, next) => {
  if (!req.path.startsWith('/api/catalog')) return next()
  return catalogRouter(req, res)
})

// AI & student
app.all('/api/ai/orchestrate', aiOrchestrate)
app.all('/api/student/photo-search', photoSearch)

// 高考志愿填报
app.all('/api/volunteer/generate', volunteerApi)
app.all('/api/volunteer/schemes', volunteerApi)
app.all('/api/volunteer/scheme/:id', volunteerApi)

app.all('/api/ocr/handwriting-to-handout', handwritingHandout)

app.all('/api/handouts/ocr-process', handoutOcrProcess)

// ─── 404 兜底 ───
app.use('/api', (req, res) => {
  res.status(404).json({ success: false, message: 'API route not found', path: req.path })
})

// ─── 启动 ───
const PORT = Number(process.env.PORT) || 3001
createServer(app).listen(PORT, '0.0.0.0', () => {
  console.log('[server] ✅ Teacher API running on port', PORT)
})
