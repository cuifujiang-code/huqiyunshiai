import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { ensureMockUser } from './mockAuth.js'
import { registerGenerateExamRoute } from './generateExamRoute.js'
import { registerDiagnosisRoute } from './diagnosisRoute.js'

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors())
app.use(express.json())

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: '华祺云师AI API' })
})

registerGenerateExamRoute(app)
registerDiagnosisRoute(app)

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

app.get('/api/qiniu/test', async (_req, res) => {
  const apiKey = process.env.QINIUAI_API_KEY
  const apiUrl = process.env.QINIUAI_API_URL || 'https://api.qiniu.com'

  if (!apiKey) {
    return res.status(400).json({
      success: false,
      message: 'QINIUAI_API_KEY 未配置，请在 .env 文件中设置',
    })
  }

  try {
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(10000),
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
      message: response.ok
        ? '七牛云 API 联通成功'
        : `七牛云 API 返回 ${response.status}，请检查密钥与接口地址`,
      data: body,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误'
    return res.status(502).json({
      success: false,
      message: `请求七牛云失败：${message}`,
    })
  }
})

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'API 路由不存在' })
})

app.listen(PORT, () => {
  console.log(`华祺云师AI 后端服务运行在 http://localhost:${PORT}`)
})
