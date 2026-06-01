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
    apiKeyPrefix: cfg.apiKey ? `${cfg.apiKey.slice(0, 8)}…` : '(missing)',
    apiBase: cfg.apiBase,
    model: cfg.model,
    visionModel: cfg.visionModel || cfg.model,
    visionEnabled: cfg.visionEnabled,
    url: cfg.url,
  }
}

const EMPTY_CONTENT_RETRY_DELAY_MS = 2000
const MAX_EMPTY_CONTENT_RETRIES = 1

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function extractMessageContent(data) {
  const choice = data?.choices?.[0]
  const content = choice?.message?.content
  if (typeof content === 'string' && content.trim()) return content.trim()

  // 部分兼容实现可能返回 reasoning_content 或其它字段
  const alt = choice?.message?.reasoning_content ?? choice?.text ?? data?.content
  if (typeof alt === 'string' && alt.trim()) return alt.trim()

  return ''
}

async function executeDeepSeekRequest(body, { label = 'DeepSeek', model, attempt = 0 } = {}) {
  const cfg = getDeepSeekConfig()
  const requestBody = JSON.stringify(body)
  const requestBodyBytes = Buffer.byteLength(requestBody, 'utf8')
  const resolvedModel = model || body.model

  console.log('[DeepSeek] 请求开始', {
    label,
    attempt,
    url: cfg.url,
    apiBase: cfg.apiBase,
    model: resolvedModel,
    hasApiKey: Boolean(cfg.apiKey),
    authHeader: cfg.apiKey ? 'Bearer ***' : '(missing)',
    requestBodyBytes,
    messageCount: Array.isArray(body.messages) ? body.messages.length : 0,
    maxTokens: body.max_tokens,
    stream: body.stream ?? false,
  })

  const started = Date.now()
  let response
  try {
    response = await fetch(cfg.url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: requestBody,
      signal: AbortSignal.timeout(25000),
    })
  } catch (fetchErr) {
    const message = fetchErr instanceof Error ? fetchErr.message : String(fetchErr)
    const err = new DeepSeekApiError(`DeepSeek 网络请求异常: ${message}`, {
      url: cfg.url,
      model: resolvedModel,
      config: getDeepSeekConfigSummary(),
    })
    console.error('[DeepSeek] 网络错误', { label, attempt, ...err.toJSON() })
    throw err
  }

  const elapsedMs = Date.now() - started
  const responseText = await response.text()
  const statusCode = response.status

  console.log(`[DeepSeek] 响应状态码=${statusCode}`, {
    label,
    attempt,
    elapsedMs,
    ok: response.ok,
    responseBodyBytes: Buffer.byteLength(responseText, 'utf8'),
  })

  if (statusCode !== 200) {
    console.error('[DeepSeek] 非200响应完整body', {
      label,
      attempt,
      statusCode,
      url: cfg.url,
      body: responseText,
    })
    const err = new DeepSeekApiError(`DeepSeek API 请求失败 (HTTP ${statusCode})`, {
      statusCode,
      responseBody: responseText,
      url: cfg.url,
      model: resolvedModel,
      config: getDeepSeekConfigSummary(),
    })
    throw err
  }

  let data
  try {
    data = JSON.parse(responseText)
  } catch {
    console.error('[DeepSeek] 响应不是合法 JSON', {
      label,
      attempt,
      body: responseText,
    })
    const err = new DeepSeekApiError('DeepSeek 响应不是合法 JSON', {
      statusCode,
      responseBody: responseText,
      url: cfg.url,
      model: resolvedModel,
    })
    throw err
  }

  const content = extractMessageContent(data)
  if (!content) {
    console.warn('[DeepSeek] 响应内容为空', {
      label,
      attempt,
      finishReason: data?.choices?.[0]?.finish_reason,
      choiceKeys: data?.choices?.[0] ? Object.keys(data.choices[0]) : [],
      messageKeys: data?.choices?.[0]?.message ? Object.keys(data.choices[0].message) : [],
      responsePreview: JSON.stringify(data).slice(0, 1500),
    })

    if (attempt < MAX_EMPTY_CONTENT_RETRIES) {
      console.warn('[DeepSeek] 空内容，2秒后重试', { label, nextAttempt: attempt + 1 })
      await sleep(EMPTY_CONTENT_RETRY_DELAY_MS)
      return executeDeepSeekRequest(body, { label, model: resolvedModel, attempt: attempt + 1 })
    }

    const err = new DeepSeekApiError('DeepSeek API 未返回有效内容（已重试仍为空）', {
      statusCode,
      responseBody: JSON.stringify(data),
      url: cfg.url,
      model: resolvedModel,
      config: getDeepSeekConfigSummary(),
    })
    console.error('[DeepSeek] 空内容最终失败', err.toJSON())
    throw err
  }

  console.log(`[${label}] 调用成功`, {
    model: resolvedModel,
    elapsedMs,
    contentLength: content.length,
    attempt,
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

  // OpenAI 兼容格式：POST {base}/chat/completions
  return executeDeepSeekRequest(
    {
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: options.temperature ?? 0.7,
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
