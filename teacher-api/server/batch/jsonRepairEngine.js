/**
 * AI 拆题 JSON 终极修复引擎
 * 策略顺序：提取块 → 去注释 → 去尾逗号 → 单引号→双引号 → 补引号 → 补逗号 → JSON5 → 逐对象提取 → 正则拆分逐个解析
 */
import JSON5 from 'json5'

const LOG_PREVIEW_LEN = 1000

function uniqueStrings(list) {
  const seen = new Set()
  const out = []
  for (const s of list) {
    const v = String(s ?? '').trim()
    if (!v || seen.has(v)) continue
    seen.add(v)
    out.push(v)
  }
  return out
}

/** 1. 提取 JSON 块（markdown / 括号切片） */
export function extractJsonBlock(raw) {
  let s = String(raw ?? '').replace(/^\uFEFF/, '').trim()
  if (!s) return ''

  s = s.replace(/```(?:json|JSON)?\s*/gi, '').replace(/```\s*/g, '')

  const codeBlocks = [...s.matchAll(/```(?:json|JSON)?\s*([\s\S]*?)```/gi)]
  if (codeBlocks.length) {
    const best = codeBlocks
      .map((m) => m[1].trim())
      .filter(Boolean)
      .sort((a, b) => {
        const score = (t) => (t.startsWith('[') || t.startsWith('{') ? 10 : 0) + t.length
        return score(b) - score(a)
      })[0]
    if (best) s = best
  }

  const arrStart = s.indexOf('[')
  const arrEnd = s.lastIndexOf(']')
  if (arrStart >= 0 && arrEnd > arrStart) {
    return s.slice(arrStart, arrEnd + 1).trim()
  }

  const objStart = s.indexOf('{')
  const objEnd = s.lastIndexOf('}')
  if (objStart >= 0 && objEnd > objStart) {
    return s.slice(objStart, objEnd + 1).trim()
  }

  return s.trim()
}

/** 2. 移除 JS 风格注释 */
export function removeComments(text) {
  return String(text ?? '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n\r]*/g, '')
}

/** 3. 移除尾随逗号 */
export function removeTrailingCommas(text) {
  let s = String(text ?? '')
  for (let i = 0; i < 5; i++) {
    const next = s.replace(/,\s*([}\]])/g, '$1')
    if (next === s) break
    s = next
  }
  return s
}

/** 4. 单引号转双引号（键与简单字符串值） */
export function convertSingleQuotes(text) {
  let s = String(text ?? '')
  s = s.replace(/([{,]\s*)'([^'\\]*(?:\\.[^'\\]*)*)'\s*:/g, '$1"$2":')
  s = s.replace(/:\s*'([^'\\]*(?:\\.[^'\\]*)*)'/g, ': "$1"')

  const hasDoubleKeys = /"[^"\\]*(?:\\.[^"\\]*)*"\s*:/.test(s)
  const hasSingleKeys = /'[^'\\]*(?:\\.[^'\\]*)*'\s*:/.test(s)
  if (!hasDoubleKeys && hasSingleKeys) {
    s = s.replace(/'/g, '"')
  }
  return s
}

/** 5. 为未加引号的 key 补双引号 */
export function fixMissingQuotes(text) {
  return String(text ?? '').replace(
    /([{,]\s*)([a-zA-Z_$][\w$]*)(\s*:)/g,
    '$1"$2"$3',
  )
}

/** 6. 补缺失逗号（相邻属性/对象） */
export function fixMissingCommas(text) {
  let s = String(text ?? '')
  s = s.replace(/}\s*{/g, '},{')
  s = s.replace(/]\s*\[/g, '],[')
  s = s.replace(/"\s*\n\s*"/g, '",\n"')
  s = s.replace(/(\d)\s*\n\s*"/g, '$1,\n"')
  s = s.replace(/"\s*\n\s*([a-zA-Z_$])/g, '",\n"$1')
  s = s.replace(/}\s*"/g, '},"')
  s = s.replace(/]\s*"/g, '],"')
  return s
}

function tryNativeParse(text) {
  try {
    return { ok: true, value: JSON.parse(text) }
  } catch (err) {
    return { ok: false, error: err }
  }
}

function tryJson5Parse(text) {
  try {
    return { ok: true, value: JSON5.parse(text) }
  } catch (err) {
    return { ok: false, error: err }
  }
}

/** 7. 逐对象正则/括号扫描提取 */
export function extractObjectsByRegex(text) {
  const s = String(text ?? '').trim()
  if (!s.includes('{')) return null

  const objects = []
  let i = 0
  while (i < s.length) {
    const start = s.indexOf('{', i)
    if (start === -1) break

    let depth = 0
    let inString = false
    let escape = false
    let end = -1

    for (let j = start; j < s.length; j++) {
      const ch = s[j]
      if (inString) {
        if (escape) {
          escape = false
          continue
        }
        if (ch === '\\') {
          escape = true
          continue
        }
        if (ch === '"') inString = false
        continue
      }

      if (ch === '"') {
        inString = true
        continue
      }
      if (ch === '{') depth++
      else if (ch === '}') {
        depth--
        if (depth === 0) {
          end = j
          break
        }
      }
    }

    if (end === -1) break

    const fragment = s.slice(start, end + 1)
    const repaired = buildRepairPipeline(fragment)
    for (const candidate of repaired) {
      const native = tryNativeParse(candidate)
      if (native.ok && native.value && typeof native.value === 'object' && !Array.isArray(native.value)) {
        objects.push(native.value)
        break
      }
      const j5 = tryJson5Parse(candidate)
      if (j5.ok && j5.value && typeof j5.value === 'object' && !Array.isArray(j5.value)) {
        objects.push(j5.value)
        break
      }
    }

    i = end + 1
  }

  return objects.length > 0 ? objects : null
}

function buildRepairPipeline(base) {
  const steps = [base]
  let s = base
  const push = () => {
    if (s?.trim()) steps.push(s)
  }

  s = removeComments(base)
  push()
  s = removeTrailingCommas(s)
  push()
  s = convertSingleQuotes(s)
  push()
  s = fixMissingQuotes(s)
  push()
  s = fixMissingCommas(s)
  push()

  return uniqueStrings(steps)
}

/** 9. 最后兜底：按 },{ 拆分，逐个对象修复解析并合并 */
export function extractAndParseIndividualObjects(text) {
  const s = String(text ?? '').trim()
  if (!s) return null

  // 去掉外层 [ ]
  let inner = s
  if (inner.startsWith('[')) inner = inner.slice(1)
  if (inner.endsWith(']')) inner = inner.slice(0, -1)
  inner = inner.trim()
  if (!inner) return null

  // 按 },{ 拆分（保留对象间的分隔）
  // 先尝试智能拆分：用深度跟踪找到每个顶层 { } 对象
  const objectBoundaries = []
  let depth = 0
  let inString = false
  let escape = false
  let objStart = -1

  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i]

    if (inString) {
      if (escape) { escape = false; continue }
      if (ch === '\\') { escape = true; continue }
      if (ch === '"') inString = false
      continue
    }

    if (ch === '"') { inString = true; continue }
    if (ch === '{') {
      if (depth === 0) objStart = i
      depth++
    } else if (ch === '}') {
      depth--
      if (depth === 0 && objStart >= 0) {
        objectBoundaries.push({ start: objStart, end: i })
        objStart = -1
      }
    }
  }

  // 如果深度跟踪失败，回退到粗糙的 },{ 拆分
  if (objectBoundaries.length === 0) {
    const roughParts = inner.split(/},[\s\n\r]*{/)
    if (roughParts.length <= 1) return null

    const fragments = []
    for (let i = 0; i < roughParts.length; i++) {
      let piece = roughParts[i].trim()
      if (!piece.startsWith('{')) piece = '{' + piece
      if (i < roughParts.length - 1 && !piece.endsWith('}')) piece = piece + '}'
      if (piece.startsWith('{') && piece.endsWith('}')) {
        fragments.push(piece)
      }
    }
    return tryParseFragments(fragments)
  }

  // 从深度跟踪结果中提取每个对象的字符串
  const fragments = objectBoundaries.map(({ start, end }) => inner.slice(start, end + 1).trim())
  return tryParseFragments(fragments)
}

function tryParseFragments(fragments) {
  if (!fragments.length) return null

  const parsed = []
  let successCount = 0

  for (const fragment of fragments) {
    // 对每个对象独立走修复管线
    const candidates = buildRepairPipeline(fragment)
    let obj = null

    for (const candidate of candidates) {
      const native = tryNativeParse(candidate)
      if (native.ok && native.value && typeof native.value === 'object' && !Array.isArray(native.value)) {
        obj = native.value
        break
      }
      const j5 = tryJson5Parse(candidate)
      if (j5.ok && j5.value && typeof j5.value === 'object' && !Array.isArray(j5.value)) {
        obj = j5.value
        break
      }
    }

    if (obj) {
      parsed.push(obj)
      successCount++
    } else {
      // 单个对象失败时记录日志但不中断
      console.warn('[jsonRepairEngine] 第9步 - 单个对象解析失败', {
        fragmentLength: fragment.length,
        fragmentPreview: fragment.slice(0, 200),
      })
    }
  }

  if (successCount > 0) {
    console.log('[jsonRepairEngine] 第9步正则拆分解析成功', {
      totalObjects: fragments.length,
      successfulObjects: successCount,
      failedObjects: fragments.length - successCount,
    })
    return parsed
  }

  return null
}

function logRepairFailure(raw, lastError) {
  const preview = String(raw ?? '').slice(0, LOG_PREVIEW_LEN)
  const message = lastError instanceof Error ? lastError.message : String(lastError ?? '未知错误')

  // 从错误消息中提取失败位置
  const posMatch = message.match(/position\s*(\d+)/i)
  const errorPos = posMatch ? Number(posMatch[1]) : null
  let errorContext = '(位置未知)'
  if (errorPos !== null && errorPos < raw.length) {
    const ctxStart = Math.max(0, errorPos - 200)
    const ctxEnd = Math.min(raw.length, errorPos + 200)
    errorContext = raw.slice(ctxStart, ctxEnd)
    console.error('[jsonRepairEngine] 失败位置上下文', {
      errorPosition: errorPos,
      totalLength: raw.length,
      contextAroundError: errorContext,
      pointer: ' '.repeat(Math.min(200, errorPos - ctxStart)) + '▲ pos ' + errorPos,
    })
  }

  console.error('[jsonRepairEngine] 全部修复策略失败', {
    message,
    previewLength: preview.length,
    totalLength: raw.length,
    preview,
  })
  throw new Error(
    `JSON 修复失败: ${message}。总长度${raw.length}，位置${errorPos ?? '未知'}上下文: ${errorContext.slice(0, 300)}`,
  )
}

/**
 * 终极 JSON 修复入口
 * @param {string} rawString AI 原始输出
 * @returns {unknown} 解析后的对象/数组
 */
export function repairJSON(rawString) {
  const raw = String(rawString ?? '').trim()
  if (!raw) {
    logRepairFailure(raw, new Error('输入为空'))
  }

  const extracted = extractJsonBlock(raw)
  const bases = uniqueStrings([extracted, raw])
  const candidates = []

  for (const base of bases) {
    candidates.push(...buildRepairPipeline(base))
  }

  let lastError = new Error('无可用候选')

  for (const candidate of uniqueStrings(candidates)) {
    const native = tryNativeParse(candidate)
    if (native.ok) {
      console.log('[jsonRepairEngine] 解析成功', { strategy: 'JSON.parse', length: candidate.length })
      return native.value
    }
    lastError = native.error

    const j5 = tryJson5Parse(candidate)
    if (j5.ok) {
      console.log('[jsonRepairEngine] 解析成功', { strategy: 'JSON5.parse', length: candidate.length })
      return j5.value
    }
    lastError = j5.error
  }

  for (const base of bases) {
    const objects = extractObjectsByRegex(base)
    if (objects?.length) {
      console.log('[jsonRepairEngine] 解析成功', {
        strategy: 'extractObjectsByRegex',
        count: objects.length,
      })
      return objects
    }
  }

  // 第9步：正则拆分逐个对象解析（最后兜底）
  for (const base of bases) {
    const objects = extractAndParseIndividualObjects(base)
    if (objects?.length) {
      console.log('[jsonRepairEngine] 解析成功', {
        strategy: 'extractAndParseIndividualObjects',
        count: objects.length,
      })
      return objects
    }
  }

  logRepairFailure(raw, lastError)
}
