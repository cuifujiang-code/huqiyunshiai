/**
 * DeepSeek API 统一调用客户端（OpenAI 兼容格式）
 */

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
  const url = apiBase.includes('/chat/completions') ? apiBase : `${apiBase}/chat/completions`

  return {
    apiKey,
    apiBase,
    model,
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
    url: cfg.url,
  }
}

export async function callDeepSeekAI(systemPrompt, userPrompt) {
  const cfg = getDeepSeekConfig()

  console.log('[DeepSeek] 配置检查', getDeepSeekConfigSummary())

  if (!cfg.apiKey) {
    const err = new DeepSeekApiError('DEEPSEEK_API_KEY 未配置', {
      config: getDeepSeekConfigSummary(),
    })
    console.error('[DeepSeek] 调用失败', err.toJSON())
    throw err
  }

  console.log('[DeepSeek] 发起请求', {
    url: cfg.url,
    model: cfg.model,
    systemPromptLength: systemPrompt?.length ?? 0,
    userPromptLength: userPrompt?.length ?? 0,
  })

  let response
  try {
    response = await fetch(cfg.url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: cfg.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 4096,
        stream: false,
      }),
      signal: AbortSignal.timeout(120000),
    })
  } catch (fetchErr) {
    const message = fetchErr instanceof Error ? fetchErr.message : String(fetchErr)
    const err = new DeepSeekApiError(`DeepSeek 网络请求异常: ${message}`, {
      url: cfg.url,
      model: cfg.model,
      config: getDeepSeekConfigSummary(),
    })
    console.error('[DeepSeek] 网络错误', err.toJSON())
    throw err
  }

  const responseText = await response.text()

  if (!response.ok) {
    const err = new DeepSeekApiError(`DeepSeek API 请求失败 (${response.status})`, {
      statusCode: response.status,
      responseBody: responseText.slice(0, 2000),
      url: cfg.url,
      model: cfg.model,
      config: getDeepSeekConfigSummary(),
    })
    console.error('[DeepSeek] HTTP 错误', {
      status: response.status,
      statusText: response.statusText,
      body: responseText.slice(0, 2000),
      url: cfg.url,
      model: cfg.model,
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
      model: cfg.model,
    })
    console.error('[DeepSeek] JSON 解析失败', err.toJSON())
    throw err
  }

  const content = data?.choices?.[0]?.message?.content
  if (!content) {
    const err = new DeepSeekApiError('DeepSeek API 未返回有效内容', {
      statusCode: response.status,
      responseBody: JSON.stringify(data).slice(0, 2000),
      url: cfg.url,
      model: cfg.model,
    })
    console.error('[DeepSeek] 空内容', err.toJSON())
    throw err
  }

  console.log('[DeepSeek] 调用成功', {
    model: cfg.model,
    contentLength: content.length,
  })

  return content
}

export function extractJson(text) {
  const trimmed = text.trim()
  const codeBlock = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlock) return codeBlock[1].trim()

  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1)
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
