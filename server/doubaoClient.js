/**
 * 豆包视觉 API — 手写讲义 OCR 专用
 */
import { normalizeImageBase64 } from './deepseekClient.js'

const DEFAULT_TIMEOUT_MS = Number(process.env.HANDOUT_OCR_TIMEOUT_MS || 120000)

function getDoubaoConfig(options = {}) {
  const apiKey = process.env.DOUBAO_API_KEY?.trim()
  if (!apiKey) throw new Error('DOUBAO_API_KEY 未配置')
  return {
    apiKey,
    baseUrl: (process.env.DOUBAO_API_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3').replace(/\/$/, ''),
    model:
      options.model ||
      process.env.DOUBAO_VISION_MODEL?.trim() ||
      process.env.DOUBAO_MODEL?.trim() ||
      'doubao-1-5-pro-32k',
  }
}

async function parseChatResponse(response, label) {
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`${label} HTTP ${response.status}: ${text.slice(0, 400)}`)
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

/** 豆包多模态视觉识别 */
export async function callDoubaoVisionAI(systemPrompt, userPrompt, imageBase64, mimeType = 'image/png', options = {}) {
  const { apiKey, baseUrl, model } = getDoubaoConfig(options)
  const { base64, mimeType: resolvedMime } = normalizeImageBase64(imageBase64, mimeType)
  if (!base64) throw new Error('图片 Base64 为空')

  const url = `${baseUrl}/chat/completions`
  const controller = new AbortController()
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
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
        stream: false,
      }),
    })
    return parseChatResponse(response, options.label || 'Doubao-Vision')
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new Error(`Doubao-Vision 调用超时（${timeoutMs}ms）`)
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

/** 豆包文本对话（结构化 JSON 等） */
export async function callDoubaoAI(systemPrompt, userPrompt, options = {}) {
  const { apiKey, baseUrl, model } = getDoubaoConfig(options)
  const url = `${baseUrl}/chat/completions`
  const controller = new AbortController()
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: options.textModel || model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: options.temperature ?? 0.2,
        max_tokens: options.maxTokens ?? 4096,
        stream: false,
      }),
    })
    return parseChatResponse(response, options.label || 'Doubao')
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new Error(`Doubao 调用超时（${timeoutMs}ms）`)
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

export function isDoubaoConfigured() {
  return Boolean(process.env.DOUBAO_API_KEY?.trim())
}
