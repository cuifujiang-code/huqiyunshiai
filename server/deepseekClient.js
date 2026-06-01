/**
 * DeepSeek API 统一调用客户端（OpenAI 兼容格式）
 */
import { resolveChatCompletionsUrl } from './urlUtil.js'

export class DeepSeekApiError extends Error {
  constructor(message, { statusCode, responseBody, url, model, config } = {}) {
    super(message)
    this.name = 'DeepSeekApiError'
    this.statusCode = statusCode
    this.responseBody = responseBody
    this.url = url
    this.model = model
    this.config = config
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      statusCode: this.statusCode,
      responseBody: this.responseBody,
      url: this.url,
      model: this.model,
      config: this.config,
    }
  }
}

export function getDeepSeekConfig() {
  const apiKey = process.env.DEEPSEEK_API_KEY
  const apiBase = (process.env.DEEPSEEK_API_BASE_URL || 'https://api.deepseek.com').replace(/\/$/, '')
  const model = process.env.DEEPSEEK_MODEL || 'deepseek-chat'
  const visionModelEnv = process.env.DEEPSEEK_VISION_MODEL?.trim() || ''
  const url = resolveChatCompletionsUrl(apiBase)

  return {
    apiKey,
    apiBase,
    model,
    visionModel: visionModelEnv,
    visionEnabled: Boolean(visionModelEnv),
    url,
    hasApiKey: Boolean(apiKey),
  }
}

export function getDeepSeekConfigSummary() {
  const cfg = getDeepSeekConfig()
  return {
    hasApiKey: cfg.hasApiKey,
    apiBase: cfg.apiBase,
    model: cfg.model,
    visionModel: cfg.visionModel || cfg.model,
    visionEnabled: cfg.visionEnabled,
    url: cfg.url,
  }
}

async function executeDeepSeekRequest(body, { label = 'DeepSeek', model } = {}) {
  const cfg = getDeepSeekConfig()
  const requestBody = JSON.stringify(body)
  const requestBodyBytes = Buffer.byteLength(requestBody, 'utf8')

  console.log(`[${label}] 发起请求`, {
    url: cfg.url,
    model: model || body.model,
    requestBodyBytes,
    requestBodyKB: (requestBodyBytes / 1024).toFixed(1),
  })

  const started = Date.now()
  let response
  try {
    response = await fetch(cfg.url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: requestBody,
      signal: AbortSignal.timeout(45000),
    })
  } catch (fetchErr) {
    const message = fetchErr instanceof Error ? fetchErr.message : String(fetchErr)
    const err = new DeepSeekApiError(`DeepSeek 网络请求异常: ${message}`, {
      url: cfg.url,
      model: model || body.model,
      config: getDeepSeekConfigSummary(),
    })
    console.error(`[${label}] 网络错误`, err.toJSON())
    throw err
  }

  const elapsedMs = Date.now() - started
  const responseText = await response.text()

  console.log(`[${label}] 收到响应`, {
    status: response.status,
    elapsedMs,
    responseBodyBytes: Buffer.byteLength(responseText, 'utf8'),
  })

  if (!response.ok) {
    const err = new DeepSeekApiError(`DeepSeek API 请求失败 (${response.status})`, {
      statusCode: response.status,
      responseBody: responseText.slice(0, 2000),
      url: cfg.url,
      model: model || body.model,
      config: getDeepSeekConfigSummary(),
    })
    console.error(`[${label}] HTTP 错误`, {
      status: response.status,
      elapsedMs,
      body: responseText.slice(0, 2000),
    })
    throw err
  }

  let data
  try {
    data = JSON.parse(responseText)
  } catch {
    const err = new DeepSeekApiError('DeepSeek 响应不是合法 JSON', {
      statusCode: response.status,
      responseBody: responseText.slice(0, 2000),
      url: cfg.url,
      model: model || body.model,
    })
    console.error(`[${label}] JSON 解析失败`, err.toJSON())
    throw err
  }

  const content = data?.choices?.[0]?.message?.content
  if (!content) {
    const err = new DeepSeekApiError('DeepSeek API 未返回有效内容', {
      statusCode: response.status,
      responseBody: JSON.stringify(data).slice(0, 2000),
      url: cfg.url,
      model: model || body.model,
    })
    console.error(`[${label}] 空内容`, err.toJSON())
    throw err
  }

  console.log(`[${label}] 调用成功`, {
    model: model || body.model,
    elapsedMs,
    contentLength: content.length,
  })

  return content
}

export async function callDeepSeekAI(systemPrompt, userPrompt, options = {}) {
  const cfg = getDeepSeekConfig()
  const model = options.model || cfg.model
  const maxTokens = options.maxTokens ?? 4096
  const label = options.label || 'DeepSeek'

  console.log(`[${label}] 配置检查`, getDeepSeekConfigSummary())

  if (!cfg.apiKey) {
    const err = new DeepSeekApiError('DEEPSEEK_API_KEY 未配置', {
      config: getDeepSeekConfigSummary(),
    })
    console.error(`[${label}] 调用失败`, err.toJSON())
    throw err
  }

  return executeDeepSeekRequest(
    {
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: maxTokens,
      stream: false,
    },
    { label, model },
  )
}

/**
 * 多模态调用：试卷图片以 Base64 data URL 传入（OpenAI 兼容格式）
 */
export async function callDeepSeekVisionAI(systemPrompt, userPrompt, imageBase64, mimeType = 'image/jpeg') {
  const cfg = getDeepSeekConfig()

  console.log('[DeepSeek Vision] 配置检查', getDeepSeekConfigSummary())

  if (!cfg.apiKey) {
    throw new DeepSeekApiError('DEEPSEEK_API_KEY 未配置', { config: getDeepSeekConfigSummary() })
  }

  if (!imageBase64) {
    throw new DeepSeekApiError('缺少试卷图片 Base64 数据')
  }

  const imageBytes = Buffer.byteLength(imageBase64, 'utf8')
  console.log('[DeepSeek Vision] 图片数据', {
    mimeType,
    base64Bytes: imageBytes,
    base64KB: (imageBytes / 1024).toFixed(1),
  })

  const dataUrl = `data:${mimeType};base64,${imageBase64}`

  return executeDeepSeekRequest(
    {
      model: cfg.visionModel || cfg.model,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: dataUrl, detail: 'high' },
            },
            { type: 'text', text: userPrompt },
          ],
        },
      ],
      temperature: 0.4,
      max_tokens: 8192,
      stream: false,
    },
    { label: 'DeepSeek Vision', model: cfg.visionModel || cfg.model },
  )
}

export function extractJson(text) {
  const trimmed = text.trim()
  const codeBlock = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlock) return codeBlock[1].trim()

  const arrStart = trimmed.indexOf('[')
  const arrEnd = trimmed.lastIndexOf(']')
  const objStart = trimmed.indexOf('{')
  const objEnd = trimmed.lastIndexOf('}')

  if (arrStart >= 0 && arrEnd > arrStart && (objStart < 0 || arrStart <= objStart)) {
    return trimmed.slice(arrStart, arrEnd + 1)
  }
  if (objStart >= 0 && objEnd > objStart) return trimmed.slice(objStart, objEnd + 1)
  return trimmed
}

export function serializeError(error) {
  if (error instanceof DeepSeekApiError) {
    return error.toJSON()
  }
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack?.split('\n').slice(0, 5),
    }
  }
  return { message: String(error) }
}
