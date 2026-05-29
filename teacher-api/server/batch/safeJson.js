/** 安全 JSON 解析，仅使用 JSON.parse，禁止 eval / new Function */
export function safeJsonParse(text) {
  if (text == null || text === '') {
    throw new Error('JSON 内容为空')
  }
  const normalized = String(text).trim()
  return JSON.parse(normalized)
}
