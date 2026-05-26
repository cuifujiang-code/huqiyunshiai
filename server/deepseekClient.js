/**
 * DeepSeek API 统一调用客户端（OpenAI 兼容格式）
 */
export async function callDeepSeekAI(systemPrompt, userPrompt) {
  const apiKey = process.env.DEEPSEEK_API_KEY
  const apiBase = (process.env.DEEPSEEK_API_BASE_URL || 'https://api.deepseek.com').replace(/\/$/, '')
  const model = process.env.DEEPSEEK_MODEL || 'deepseek-chat'

  if (!apiKey) {
    throw new Error('DEEPSEEK_API_KEY 未配置')
  }

  const url = apiBase.includes('/chat/completions') ? apiBase : `${apiBase}/chat/completions`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
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

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`DeepSeek API 请求失败 (${response.status}): ${errText.slice(0, 200)}`)
  }

  const data = await response.json()
  const content = data?.choices?.[0]?.message?.content
  if (!content) throw new Error('DeepSeek API 未返回有效内容')
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
