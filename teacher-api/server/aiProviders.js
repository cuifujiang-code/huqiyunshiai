/**
 * 多 AI 提供商统一调用（30s 超时 + 可用性检测）
 */
import {
  callDeepSeekAI,
  callDeepSeekVisionAI,
  getDeepSeekConfig,
  getDeepSeekVisionModel,
  normalizeImageBase64,
} from './deepseekClient.js'
import { recognizeHandwritingHttp, isAlibabaOcrConfigured } from './alibabaOcrHttp.js'

import { isDoubaoConfigured } from './doubaoClient.js'

export const AI_CALL_TIMEOUT_MS = Number(process.env.AI_ORCHESTRATOR_TIMEOUT_MS || 30000)

export function isDeepSeekAvailable() {
  return getDeepSeekConfig().hasApiKey
}

export function isDoubaoAvailable() {
  return isDoubaoConfigured()
}

export function isDoubaoVisionOcrAvailable() {
  return isDoubaoConfigured()
}

export function isQianwenAvailable() {
  return Boolean(process.env.QIANWEN_API_KEY?.trim())
}

export function isAlibabaOcrAvailable() {
  return isAlibabaOcrConfigured()
}

export function withTimeout(promise, ms = AI_CALL_TIMEOUT_MS, label = 'AI') {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} 调用超时（${ms}ms）`)), ms)
    Promise.resolve(promise)
      .then((v) => {
        clearTimeout(timer)
        resolve(v)
      })
      .catch((e) => {
        clearTimeout(timer)
        reject(e)
      })
  })
}

async function chatCompletions({
  apiKey,
  baseUrl,
  model,
  systemPrompt,
  userPrompt,
  label,
  timeoutMs = AI_CALL_TIMEOUT_MS,
  temperature = 0.3,
  maxTokens = 4096,
}) {
  const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`
  const response = await withTimeout(
    fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature,
        max_tokens: maxTokens,
        stream: false,
      }),
    }),
    timeoutMs,
    label,
  )

  const text = await response.text()
  if (!response.ok) {
    throw new Error(`${label} HTTP ${response.status}: ${text.slice(0, 300)}`)
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

export async function callDoubaoAI(systemPrompt, userPrompt, options = {}) {
  const apiKey = process.env.DOUBAO_API_KEY?.trim()
  if (!apiKey) throw new Error('DOUBAO_API_KEY 未配置')

  const baseUrl = process.env.DOUBAO_API_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3'
  const model = options.model || process.env.DOUBAO_MODEL || 'doubao-1-5-pro-32k'

  return chatCompletions({
    apiKey,
    baseUrl,
    model,
    systemPrompt,
    userPrompt,
    label: options.label || 'Doubao',
    timeoutMs: options.timeoutMs ?? AI_CALL_TIMEOUT_MS,
    temperature: options.temperature ?? 0.3,
    maxTokens: options.maxTokens ?? 4096,
  })
}

export async function callQianwenAI(systemPrompt, userPrompt, options = {}) {
  const apiKey = process.env.QIANWEN_API_KEY?.trim()
  if (!apiKey) throw new Error('QIANWEN_API_KEY 未配置')

  const baseUrl =
    process.env.QIANWEN_API_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1'
  const model = options.model || process.env.QIANWEN_MODEL || 'qwen-plus'

  return chatCompletions({
    apiKey,
    baseUrl,
    model,
    systemPrompt,
    userPrompt,
    label: options.label || 'Qianwen',
    timeoutMs: options.timeoutMs ?? AI_CALL_TIMEOUT_MS,
    temperature: options.temperature ?? 0.3,
    maxTokens: options.maxTokens ?? 4096,
  })
}

export async function callDeepSeekWithTimeout(systemPrompt, userPrompt, options = {}) {
  return withTimeout(
    callDeepSeekAI(systemPrompt, userPrompt, {
      ...options,
      timeoutMs: options.timeoutMs ?? AI_CALL_TIMEOUT_MS,
    }),
    options.timeoutMs ?? AI_CALL_TIMEOUT_MS,
    options.label || 'DeepSeek',
  )
}

/**
 * 安全调用：失败则跳过并返回 skipped
 */
export async function safeAiCall(name, available, fn) {
  if (!available()) {
    console.log(`[aiProviders] 跳过 ${name}（未配置）`)
    return { provider: name, skipped: true, ok: false }
  }
  try {
    const result = await fn()
    return { provider: name, skipped: false, ok: true, result }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.warn(`[aiProviders] ${name} 失败`, { message })
    return { provider: name, skipped: false, ok: false, error: message }
  }
}

export function isVisionUnsupportedError(message) {
  const m = String(message || '').toLowerCase()
  return (
    m.includes('image_url') ||
    (m.includes('不支持') && (m.includes('image') || m.includes('视觉') || m.includes('多模态'))) ||
    m.includes('multimodal') ||
    m.includes('does not support') ||
    m.includes('vision')
  )
}

/**
 * 拍照搜题 OCR 降级：固定使用 deepseek-chat（或 DEEPSEEK_VISION_MODEL），禁止误用 v4-flash
 */
export async function callDeepSeekVisionSafe(systemPrompt, userPrompt, imageBase64, mimeType = 'image/jpeg') {
  const visionModel = getDeepSeekVisionModel()
  const { base64, mimeType: resolvedMime } = normalizeImageBase64(imageBase64, mimeType)
  const cfg = getDeepSeekConfig()

  console.log('[aiProviders] DeepSeek Vision 降级调用', {
    visionModel,
    chatModel: cfg.model,
    mimeType: resolvedMime,
    base64Length: base64.length,
    requestFormat: 'OpenAI-compatible image_url + data URL base64',
  })

  return callDeepSeekVisionAI(systemPrompt, userPrompt, base64, resolvedMime, { model: visionModel })
}

export async function runDualAlibabaOcr(imageBase64, fileName = 'photo.jpg') {
  const [standard, enhanced] = await Promise.all([
    safeAiCall('AlibabaOCR-standard', isAlibabaOcrAvailable, () =>
      recognizeHandwritingHttp(imageBase64, { fileName, mode: 'standard' }),
    ),
    safeAiCall('AlibabaOCR-enhanced', isAlibabaOcrAvailable, () =>
      recognizeHandwritingHttp(imageBase64, { fileName, mode: 'enhanced' }),
    ),
  ])

  return { standard, enhanced }
}

export { callDeepSeekAI, recognizeHandwritingHttp, getDeepSeekVisionModel, normalizeImageBase64 }
