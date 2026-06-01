/** 安全 JSON 解析：清理 AI 响应后再 JSON.parse，禁止 eval / new Function */

/**
 * 从 AI 原始文本中提取可解析的 JSON 字符串
 * 1. 提取 ```json ... ``` 代码块
 * 2. 去除首尾空白
 * 3. 定位第一个 '[' 或 '{' 作为 JSON 起始
 * 4. 支持中文标点包裹的"伪代码块"
 */
export function extractJsonFromAiText(text) {
  let s = String(text ?? '').replace(/^\uFEFF/, '').trim()
  if (!s) return ''

  // 所有 markdown 代码块，优先含 json 标记或内容以 [ { 开头的
  const codeBlocks = [...s.matchAll(/```(?:json|JSON)?\s*([\s\S]*?)```/gi)]
  if (codeBlocks.length) {
    const sorted = codeBlocks
      .map((m) => m[1].trim())
      .filter(Boolean)
      .sort((a, b) => {
        const aScore = (a.startsWith('[') || a.startsWith('{') ? 10 : 0) + a.length
        const bScore = (b.startsWith('[') || b.startsWith('{') ? 10 : 0) + b.length
        return bScore - aScore
      })
    for (const block of sorted) {
      const sliced = sliceJsonFromText(block)
      if (sliced) return sliced
    }
  }

  // 未闭合代码块：```json\n[...  无结尾 ```
  const openBlock = s.match(/```(?:json|JSON)?\s*([\s\S]*)$/i)
  if (openBlock?.[1]) {
    const sliced = sliceJsonFromText(openBlock[1].trim())
    if (sliced) return sliced
  }

  // 中文标点伪代码块：「...」、「JSON」...「/JSON」
  const cnBlock = s.match(/[「【]\s*(?:json|JSON)?\s*([\s\S]*?)[」】]/i)
  if (cnBlock?.[1]) {
    const sliced = sliceJsonFromText(cnBlock[1].trim())
    if (sliced) return sliced
  }

  return sliceJsonFromText(s)
}

/** 从文本中截取从第一个 [ 或 { 到对应末尾的 JSON 片段 */
function sliceJsonFromText(text) {
  const s = String(text ?? '').trim()
  if (!s) return ''

  const arrStart = s.indexOf('[')
  const objStart = s.indexOf('{')

  if (arrStart >= 0 && (objStart < 0 || arrStart <= objStart)) {
    // 找到匹配的 ]
    let depth = 0; let end = -1
    for (let i = arrStart; i < s.length; i++) {
      if (s[i] === '[') depth++
      else if (s[i] === ']') { depth--; if (depth === 0) { end = i; break } }
    }
    if (end > arrStart) return s.slice(arrStart, end + 1).trim()
    // 降级：最后一个 ]
    const lastBracket = s.lastIndexOf(']')
    if (lastBracket > arrStart) return s.slice(arrStart, lastBracket + 1).trim()
  }

  if (objStart >= 0) {
    let depth = 0; let end = -1
    for (let i = objStart; i < s.length; i++) {
      if (s[i] === '{') depth++
      else if (s[i] === '}') { depth--; if (depth === 0) { end = i; break } }
    }
    if (end > objStart) return s.slice(objStart, end + 1).trim()
    const lastBrace = s.lastIndexOf('}')
    if (lastBrace > objStart) return s.slice(objStart, lastBrace + 1).trim()
  }

  return s
}

/** 常见 AI JSON 瑕疵修复（尾随逗号、单引号、注释等） */
function repairJsonText(jsonText) {
  let s = String(jsonText ?? '')
    // 去除行注释
    .replace(/\/\/.*$/gm, '')
    // 去除块注释
    .replace(/\/\*[\s\S]*?\*\//g, '')
  // 尾随逗号
  s = s.replace(/,\s*]/g, ']').replace(/,\s*}/g, '}')
  // 单引号 → 双引号（仅限 key）
  s = s.replace(/'([^']+)'\s*:/g, '"$1":')
  return s
}

/**
 * 多层 JSON 嵌套解包：AI 有时会输出 JSON 字符串嵌套
 */
function unwrapNestedJson(str) {
  let s = str.trim()
  for (let i = 0; i < 5; i++) {
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
      try { s = JSON.parse(s); s = typeof s === 'string' ? s.trim() : JSON.stringify(s) }
      catch { break }
    } else {
      break
    }
  }
  return s
}

export function safeJsonParse(text) {
  if (text == null || text === '') {
    throw new Error('JSON 内容为空')
  }

  const candidates = [
    String(text).trim(),
    extractJsonFromAiText(text),
    unwrapNestedJson(String(text).trim()),
    sliceJsonFromText(String(text).trim()),
  ]

  const seen = new Set()
  let lastError = null

  for (let ci = 0; ci < candidates.length; ci++) {
    const candidate = candidates[ci]
    if (!candidate) {
      continue
    }

    for (const attempt of [candidate, repairJsonText(candidate)]) {
      if (!attempt || seen.has(attempt)) continue
      seen.add(attempt)
      try {
        const result = JSON.parse(attempt)
        return result
      } catch (err) {
        lastError = err
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error('JSON 解析失败')
}

/** 解析 AI 拆题响应：多候选清理 + parse */
export function safeJsonParseAiResponse(aiText) {
  const raw = String(aiText ?? '').trim()
  if (!raw) throw new Error('JSON 内容为空')

  const candidates = [
    extractJsonFromAiText(raw),
    unwrapNestedJson(raw),
    sliceJsonFromText(raw),
    raw,
  ]

  const seen = new Set()
  let lastError = null

  for (const candidate of candidates) {
    if (!candidate || seen.has(candidate)) continue
    seen.add(candidate)
    try {
      return safeJsonParse(candidate)
    } catch (err) {
      lastError = err
    }
  }

  throw lastError instanceof Error ? lastError : new Error('JSON 解析失败')
}
