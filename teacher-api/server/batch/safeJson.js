/** 安全 JSON 解析：委托 jsonRepairEngine，禁止 eval / new Function */
import JSON5 from 'json5'
import { repairJSON } from './jsonRepairEngine.js'

const PARSE_ERROR_PREVIEW_LEN = 500

/**
 * 解析前清洗：注释、尾随逗号、常见单引号 JSON
 */
export function sanitizeJsonForParse(jsonText) {
  let s = String(jsonText ?? '').trim()
  if (!s) return ''

  s = s.replace(/\/\*[\s\S]*?\*\//g, '')
  s = s.replace(/\/\/[^\n\r]*/g, '')
  s = s.replace(/,\s*([}\]])/g, '$1')
  s = s.replace(/([{,]\s*)'([^'\\]*(?:\\.[^'\\]*)*)'\s*:/g, '$1"$2":')

  const hasDoubleQuotedKeys = /"[^"\\]*(?:\\.[^"\\]*)*"\s*:/.test(s)
  const hasSingleQuotedKeys = /'[^'\\]*(?:\\.[^'\\]*)*'\s*:/.test(s)
  if (!hasDoubleQuotedKeys && hasSingleQuotedKeys) {
    s = s.replace(/'/g, '"')
  }

  return s.trim()
}

/** @deprecated 使用 sanitizeJsonForParse；保留别名兼容 */
export function repairJsonText(jsonText) {
  return sanitizeJsonForParse(jsonText)
}

/**
 * 从 AI 原始文本中提取可解析的 JSON 字符串
 */
export function extractJsonFromAiText(text) {
  let s = String(text ?? '').replace(/^\uFEFF/, '').trim()
  if (!s) return ''

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

  const openBlock = s.match(/```(?:json|JSON)?\s*([\s\S]*)$/i)
  if (openBlock?.[1]) {
    const sliced = sliceJsonFromText(openBlock[1].trim())
    if (sliced) return sliced
  }

  const cnBlock = s.match(/[「【]\s*(?:json|JSON)?\s*([\s\S]*?)[」】]/i)
  if (cnBlock?.[1]) {
    const sliced = sliceJsonFromText(cnBlock[1].trim())
    if (sliced) return sliced
  }

  return sliceJsonFromText(s)
}

function sliceJsonFromText(text) {
  const s = String(text ?? '').trim()
  if (!s) return ''

  const arrStart = s.indexOf('[')
  const objStart = s.indexOf('{')

  if (arrStart >= 0 && (objStart < 0 || arrStart <= objStart)) {
    let depth = 0
    let end = -1
    for (let i = arrStart; i < s.length; i++) {
      if (s[i] === '[') depth++
      else if (s[i] === ']') {
        depth--
        if (depth === 0) {
          end = i
          break
        }
      }
    }
    if (end > arrStart) return s.slice(arrStart, end + 1).trim()
    const lastBracket = s.lastIndexOf(']')
    if (lastBracket > arrStart) return s.slice(arrStart, lastBracket + 1).trim()
  }

  if (objStart >= 0) {
    let depth = 0
    let end = -1
    for (let i = objStart; i < s.length; i++) {
      if (s[i] === '{') depth++
      else if (s[i] === '}') {
        depth--
        if (depth === 0) {
          end = i
          break
        }
      }
    }
    if (end > objStart) return s.slice(objStart, end + 1).trim()
    const lastBrace = s.lastIndexOf('}')
    if (lastBrace > objStart) return s.slice(objStart, lastBrace + 1).trim()
  }

  return s
}

function unwrapNestedJson(str) {
  let s = str.trim()
  for (let i = 0; i < 5; i++) {
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
      try {
        s = JSON.parse(s)
        s = typeof s === 'string' ? s.trim() : JSON.stringify(s)
      } catch {
        break
      }
    } else {
      break
    }
  }
  return s
}

function tryNativeParse(text) {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function tryJson5Parse(text) {
  try {
    return JSON5.parse(text)
  } catch {
    return null
  }
}

function buildParseError(message, raw) {
  const preview = String(raw ?? '').slice(0, PARSE_ERROR_PREVIEW_LEN)
  console.error('[safeJson] JSON 解析失败', { message, preview })
  return new Error(
    `JSON 解析失败: ${message}。原始内容前${PARSE_ERROR_PREVIEW_LEN}字符: ${preview}`,
  )
}

function collectParseCandidates(text) {
  const raw = String(text ?? '').trim()
  const base = [
    raw,
    extractJsonFromAiText(raw),
    unwrapNestedJson(raw),
    sliceJsonFromText(raw),
  ].filter(Boolean)

  const candidates = []
  const seen = new Set()
  const add = (t) => {
    const v = String(t ?? '').trim()
    if (!v || seen.has(v)) return
    seen.add(v)
    candidates.push(v)
    const sanitized = sanitizeJsonForParse(v)
    if (sanitized && !seen.has(sanitized)) {
      seen.add(sanitized)
      candidates.push(sanitized)
    }
  }

  for (const item of base) add(item)
  return { raw, candidates }
}

/**
 * 多策略解析：JSON.parse → JSON5 → 多种清洗候选
 */
export function parseJsonLenient(text) {
  const { raw, candidates } = collectParseCandidates(text)
  if (!raw && candidates.length === 0) {
    throw buildParseError('JSON 内容为空', text)
  }

  let lastMessage = '未知错误'

  for (const attempt of candidates) {
    const native = tryNativeParse(attempt)
    if (native !== null) return native

    const json5 = tryJson5Parse(attempt)
    if (json5 !== null) return json5

    try {
      JSON.parse(attempt)
    } catch (err) {
      lastMessage = err instanceof Error ? err.message : String(err)
    }
    try {
      JSON5.parse(attempt)
    } catch (err) {
      lastMessage = err instanceof Error ? err.message : String(err)
    }
  }

  throw buildParseError(lastMessage, raw || text)
}

export function safeJsonParse(text) {
  try {
    return repairJSON(text)
  } catch (repairErr) {
    try {
      return parseJsonLenient(text)
    } catch {
      throw repairErr
    }
  }
}

/** 解析 AI 拆题响应：多候选清理 + parse */
export function safeJsonParseAiResponse(aiText) {
  return safeJsonParse(aiText)
}
