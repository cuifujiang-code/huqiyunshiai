/**
 * 安全 JSON 解析，支持多种容错策略：
 * 1. 标准 JSON.parse
 * 2. 去除 markdown 代码块标记
 * 3. 修复尾部逗号
 * 4. 修复单引号
 * 5. 去除注释
 * 6. 提取 JSON 数组/对象片段
 */

/** 从文本中提取 JSON 内容 */
function extractJsonBlock(text) {
  const trimmed = text.trim()

  // 1. Markdown 代码块
  const codeBlock = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlock) return codeBlock[1].trim()

  // 2. 中文标点伪代码块
  const cnBlock = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (cnBlock) return cnBlock[1].trim()

  // 3. 找最外层 [ 到 ] 或 { 到 }
  const arrStart = trimmed.indexOf('[')
  const objStart = trimmed.indexOf('{')

  if (arrStart >= 0 && (objStart < 0 || arrStart < objStart)) {
    // 从第一个 [ 开始用栈匹配找对应的 ]
    let depth = 0
    let end = -1
    for (let i = arrStart; i < trimmed.length; i++) {
      if (trimmed[i] === '[') depth++
      if (trimmed[i] === ']') depth--
      if (depth === 0) { end = i; break }
    }
    if (end > arrStart) return trimmed.slice(arrStart, end + 1)
  }

  if (objStart >= 0) {
    let depth = 0
    let end = -1
    for (let i = objStart; i < trimmed.length; i++) {
      if (trimmed[i] === '{') depth++
      if (trimmed[i] === '}') depth--
      if (depth === 0) { end = i; break }
    }
    if (end > objStart) return trimmed.slice(objStart, end + 1)
  }

  return trimmed
}

/** 修复常见 JSON 格式问题 */
function repairJson(text) {
  let repaired = text

  // 移除单行注释 // ...
  repaired = repaired.replace(/\/\/.*$/gm, '')

  // 移除多行注释 /* ... */
  repaired = repaired.replace(/\/\*[\s\S]*?\*\//g, '')

  // 修复尾部逗号（数组和对象）
  repaired = repaired.replace(/,(\s*[}\]])/g, '$1')

  // 修复单引号为双引号（只处理键和字符串值）
  // 简单处理：在 JSON 上下文中的单引号
  repaired = repaired.replace(/'/g, '"')

  // 修复中文引号为英文引号
  repaired = repaired.replace(/[\u201c\u201d]/g, '"')

  // 修复缺少引号的键名（简单情况）
  repaired = repaired.replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g, '$1"$2":')

  return repaired
}

export function safeJsonParse(text) {
  if (text == null || text === '') {
    throw new Error('JSON 内容为空')
  }

  const str = String(text).trim()

  // 尝试 1：直接解析
  try {
    return JSON.parse(str)
  } catch (_) {
    // 继续
  }

  // 尝试 2：提取 JSON 块后直接解析
  const extracted = extractJsonBlock(str)
  try {
    return JSON.parse(extracted)
  } catch (_) {
    // 继续
  }

  // 尝试 3：修复后解析
  const repaired = repairJson(extracted)
  try {
    return JSON.parse(repaired)
  } catch (_) {
    // 继续
  }

  // 尝试 4：如果 AI 返回的是嵌套 JSON（{ "questions": [...] } 之类）
  try {
    const obj = JSON.parse(repaired)
    if (Array.isArray(obj)) return obj
    // 检查常见的包装字段
    for (const key of ['questions', 'data', 'result', 'items', 'list']) {
      if (Array.isArray(obj[key])) return obj[key]
    }
    // 如果只有单个对象，包装成数组
    if (typeof obj === 'object' && obj !== null) {
      return [obj]
    }
    return obj
  } catch (_) {
    // 最后尝试
  }

  // 全部失败
  throw new Error(`JSON 解析失败，原始内容前 200 字符: ${str.slice(0, 200)}`)
}
