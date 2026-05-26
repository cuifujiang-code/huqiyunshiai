/**
 * 七牛云 AI 统一调用客户端
 */
export async function callQiniuAI(systemPrompt, userPrompt) {
  const apiKey = process.env.QINIUAI_API_KEY
  const apiBase = (process.env.QINIUAI_API_URL || 'https://api.qnaigc.com/v1').replace(/\/$/, '')
  const model = process.env.QINIUAI_MODEL || 'deepseek-v3'

  if (!apiKey) {
    throw new Error('QINIUAI_API_KEY 未配置')
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
    throw new Error(`七牛云 AI 请求失败 (${response.status}): ${errText.slice(0, 200)}`)
  }

  const data = await response.json()
  const content = data?.choices?.[0]?.message?.content
  if (!content) throw new Error('七牛云 AI 未返回有效内容')
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
