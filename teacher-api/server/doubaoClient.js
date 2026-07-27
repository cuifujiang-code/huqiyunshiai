/**
 * 豆包视觉 API — 手写讲义 OCR 专用
 */
import { normalizeImageBase64 } from './deepseekClient.js'

const DEFAULT_TIMEOUT_MS = Number(process.env.HANDOUT_OCR_TIMEOUT_MS || 120000)

/** 规范化 API Key（去掉 Bearer 前缀、首尾空白） */
export function normalizeDoubaoApiKey(raw) {
  let key = String(raw ?? '').trim()
  if (/^bearer\s+/i.test(key)) key = key.replace(/^bearer\s+/i, '').trim()
  return key
}

export function getDoubaoVisionModelId() {
  return (
    process.env.DOUBAO_VISION_MODEL?.trim() ||
    process.env.DOUBAO_VISION_ENDPOINT?.trim() ||
    ''
  )
}

export function getDoubaoTextModelId() {
  return (
    process.env.DOUBAO_TEXT_MODEL?.trim() ||
    process.env.DOUBAO_MODEL?.trim() ||
    getDoubaoVisionModelId()
  )
}

function getDoubaoBaseUrl() {
  return (process.env.DOUBAO_API_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3').replace(/\/$/, '')
}

function requireDoubaoApiKey() {
  const apiKey = normalizeDoubaoApiKey(process.env.DOUBAO_API_KEY || process.env.ARK_API_KEY)
  if (!apiKey) {
    throw new Error(
      'DOUBAO_API_KEY 未配置。请到火山方舟控制台 → API Key 管理 → 创建 API Key（模型推理专用，非 Coding Plan）',
    )
  }
  if (!/^(sk|ark)-[a-zA-Z0-9-]+$/.test(apiKey)) {
    throw new Error(
      'DOUBAO_API_KEY 格式异常：应以 sk- 或 ark- 开头，且不含空格或 Bearer 前缀。请从方舟控制台完整复制。',
    )
  }
  return apiKey
}

function requireDoubaoVisionModel() {
  const model = getDoubaoVisionModelId()
  if (!model) {
    throw new Error(
      'DOUBAO_VISION_MODEL 未配置。请在方舟控制台创建视觉推理接入点，将 ep-xxxxxxxx 填入 DOUBAO_VISION_MODEL。',
    )
  }
  return model
}

export function getDoubaoConfigSummary() {
  const apiKey = normalizeDoubaoApiKey(process.env.DOUBAO_API_KEY || process.env.ARK_API_KEY)
  return {
    hasApiKey: Boolean(apiKey),
    apiKeyPreview: apiKey ? `${apiKey.slice(0, 7)}…${apiKey.slice(-4)}` : '',
    baseUrl: getDoubaoBaseUrl(),
    visionModel: getDoubaoVisionModelId() || '(未配置)',
    textModel: getDoubaoTextModelId() || '(未配置)',
  }
}

export function isDoubaoConfigured() {
  return Boolean(normalizeDoubaoApiKey(process.env.DOUBAO_API_KEY || process.env.ARK_API_KEY)) && Boolean(getDoubaoVisionModelId())
}

function getDoubaoConfig(options = {}) {
  return {
    apiKey: requireDoubaoApiKey(),
    baseUrl: getDoubaoBaseUrl(),
    model: options.model || (options.forVision ? requireDoubaoVisionModel() : getDoubaoTextModelId() || requireDoubaoVisionModel()),
  }
}

async function parseChatResponse(response, label) {
  const text = await response.text()
  if (!response.ok) {
    let hint = ''
    if (response.status === 401) {
      hint =
        '。请确认：① Key 来自「方舟 → API Key 管理」（非 Coding Plan）；② 复制完整 sk-/ark- 密钥；③ 推理接入点 ep- 处于运行中'
    }
    throw new Error(`${label} HTTP ${response.status}: ${text.slice(0, 400)}${hint}`)
  }
  let data
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error(`${label} 响应非 JSON`)
  }
  const content = data?.choices?.[0]?.message?.content
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error(`${label} 返回空内容`)
  }
  return content.trim()
}

async function doubaoChatCompletions({ apiKey, baseUrl, model, body, label, timeoutMs }) {
  const url = `${baseUrl}/chat/completions`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ ...body, model, stream: false }),
    })
    return parseChatResponse(response, label)
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new Error(`${label} 调用超时（${timeoutMs}ms）`)
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

/** 启动/调试：验证豆包 Key + 视觉接入点是否可用 */
export async function validateDoubaoConnection() {
  const summary = getDoubaoConfigSummary()
  if (!summary.hasApiKey) {
    return { ok: false, ...summary, message: 'DOUBAO_API_KEY 未配置' }
  }
  if (!getDoubaoVisionModelId()) {
    return { ok: false, ...summary, message: 'DOUBAO_VISION_MODEL 未配置' }
  }

  const { apiKey, baseUrl, model } = getDoubaoConfig({ forVision: true })
  try {
    const content = await doubaoChatCompletions({
      apiKey,
      baseUrl,
      model,
      label: 'Doubao-HealthCheck',
      timeoutMs: 20000,
      body: {
        messages: [{ role: 'user', content: '回复 OK' }],
        max_tokens: 8,
        temperature: 0,
      },
    })
    return { ok: true, ...summary, message: '豆包连接正常', sample: content.slice(0, 40) }
  } catch (err) {
    return {
      ok: false,
      ...summary,
      message: err instanceof Error ? err.message : String(err),
    }
  }
}

/** 豆包多模态视觉识别 */
export async function callDoubaoVisionAI(systemPrompt, userPrompt, imageBase64, mimeType = 'image/png', options = {}) {
  const { apiKey, baseUrl, model } = getDoubaoConfig({ ...options, forVision: true })
  const { base64, mimeType: resolvedMime } = normalizeImageBase64(imageBase64, mimeType)
  if (!base64) throw new Error('图片 Base64 为空')

  return doubaoChatCompletions({
    apiKey,
    baseUrl,
    model,
    label: options.label || 'Doubao-Vision',
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    body: {
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            { type: 'text', text: userPrompt },
            { type: 'image_url', image_url: { url: `data:${resolvedMime};base64,${base64}` } },
          ],
        },
      ],
      temperature: options.temperature ?? 0.2,
      max_tokens: options.maxTokens ?? 4096,
    },
  })
}

/** 豆包文本对话（结构化 JSON 等） */
export async function callDoubaoAI(systemPrompt, userPrompt, options = {}) {
  const { apiKey, baseUrl, model } = getDoubaoConfig({ ...options, forVision: false })
  return doubaoChatCompletions({
    apiKey,
    baseUrl,
    model: options.textModel || model,
    label: options.label || 'Doubao',
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    body: {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: options.temperature ?? 0.2,
      max_tokens: options.maxTokens ?? 4096,
    },
  })
}
