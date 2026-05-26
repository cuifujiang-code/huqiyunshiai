import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { ensureMockUser } from './mockAuth.js'
import { registerGenerateExamRoute } from './generateExamRoute.js'
import { registerDiagnosisRoute } from './diagnosisRoute.js'
import { registerPlanningRoute } from './planningRoute.js'

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors())
app.use(express.json())

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: '华祺云师AI API' })
})

registerGenerateExamRoute(app)
registerDiagnosisRoute(app)
registerPlanningRoute(app)

app.post('/api/auth/ensure-mock-user', async (req, res) => {
  const { phone, role } = req.body ?? {}

  if (!phone || !role) {
    return res.status(400).json({ error: '缺少 phone 或 role 参数' })
  }
  if (role !== 'teacher' && role !== 'student') {
    return res.status(400).json({ error: 'role 只能是 teacher 或 student' })
  }

  const digits = String(phone).replace(/\D/g, '').slice(-11)
  if (digits.length !== 11) {
    return res.status(400).json({ error: '请输入有效的 11 位手机号' })
  }

  try {
    const result = await ensureMockUser(phone, role)
    return res.json({ ok: true, ...result })
  } catch (error) {
    const message = error instanceof Error ? error.message : '创建虚拟账号失败'
    return res.status(500).json({ error: message })
  }
})

app.get('/api/deepseek/test', async (_req, res) => {
  const apiKey = process.env.DEEPSEEK_API_KEY
  const apiBase = (process.env.DEEPSEEK_API_BASE_URL || 'https://api.deepseek.com').replace(/\/$/, '')
  const model = process.env.DEEPSEEK_MODEL || 'deepseek-chat'

  if (!apiKey) {
    return res.status(400).json({
      success: false,
      message: 'DEEPSEEK_API_KEY 未配置，请在 .env 或 Vercel 环境变量中设置',
    })
  }

  const url = apiBase.includes('/chat/completions') ? apiBase : `${apiBase}/chat/completions`

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: '回复：ok' }],
        max_tokens: 8,
        stream: false,
      }),
      signal: AbortSignal.timeout(15000),
    })

    const bodyText = await response.text()
    let body
    try {
      body = JSON.parse(bodyText)
    } catch {
      body = bodyText.slice(0, 500)
    }

    return res.json({
      success: response.ok,
      status: response.status,
      statusText: response.statusText,
      model,
      message: response.ok
        ? 'DeepSeek API 联通成功'
        : `DeepSeek API 返回 ${response.status}，请检查密钥、Base URL 与模型名称`,
      data: body,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误'
    return res.status(502).json({
      success: false,
      message: `请求 DeepSeek 失败：${message}`,
    })
  }
})

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'API 路由不存在' })
})

app.listen(PORT, () => {
  console.log(`华祺云师AI 后端服务运行在 http://localhost:${PORT}`)
})
