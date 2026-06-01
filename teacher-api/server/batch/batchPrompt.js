/** 专业教育题库拆题 Prompt：LaTeX 公式、几何图形、空间图形全支持 */

import { extractJsonFromAiText } from './safeJson.js'
import { IMAGE_PLACEHOLDER, FORMULA_PLACEHOLDER, IMAGE_PLACEHOLDER_RULE, JSON_EXAMPLE_WITH_LATEX, LATEX_STRICT_RULE, COMPLETE_EXTRACTION_RULE } from './batchQualityPrompts.js'

const JSON_PARSE_RETRY_DELAY_MS = 2000

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * 从 DeepSeek/OpenAI 聊天格式响应中提取 message.content
 * 支持：纯文本、JSON 字符串、{ choices: [{ message: { content: "..." } }] }
 */
export function extractDeepSeekChatContent(raw) {
  if (raw == null) return ''

  if (typeof raw === 'object') {
    const content = raw?.choices?.[0]?.message?.content
      ?? raw?.choices?.[0]?.text
      ?? raw?.message?.content
    if (typeof content === 'string' && content.trim()) return content.trim()
    return ''
  }

  const s = String(raw).replace(/^\uFEFF/, '').trim()
  if (!s) return ''

  if (s.startsWith('{') || s.startsWith('[')) {
    try {
      const parsed = JSON.parse(s)
      if (parsed && typeof parsed === 'object') {
        const fromChat = extractDeepSeekChatContent(parsed)
        if (fromChat) return fromChat
      }
    } catch {
      // 非 JSON，按纯文本继续
    }
  }

  return s
}

/**
 * 预处理 AI 原始字符串：移除 Markdown 标记，提取第一个 '[' 到最后一个 ']' 的 JSON 片段
 */
export function preprocessAiJsonString(rawText) {
  let s = String(rawText ?? '').replace(/^\uFEFF/, '').trim()
  if (!s) return ''

  // 去掉 markdown 代码块围栏（保留块内内容）
  s = s.replace(/```(?:json|JSON)?\s*([\s\S]*?)```/gi, '$1')
  s = s.replace(/^```[^\n]*\n?/gm, '').replace(/\n?```\s*$/gm, '').trim()

  const arrStart = s.indexOf('[')
  const arrEnd = s.lastIndexOf(']')
  if (arrStart >= 0 && arrEnd > arrStart) {
    return s.slice(arrStart, arrEnd + 1).trim()
  }

  const extracted = extractJsonFromAiText(s)
  return extracted || s
}

/**
 * 对预处理后的 JSON 字符串解析；失败则等待 2 秒重试一次，仍失败则记录原始内容并抛出
 */
export async function parseJsonFromAiTextWithRetry(rawText, safeJsonParseFn) {
  const fullRaw = String(rawText ?? '')
  let lastError = null

  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) {
      console.warn('[batchPrompt] JSON.parse 失败，2秒后重试', { attempt })
      await sleep(JSON_PARSE_RETRY_DELAY_MS)
    }

    const cleaned = preprocessAiJsonString(fullRaw)
    if (!cleaned) {
      lastError = new Error('JSON 内容为空')
      continue
    }

    try {
      const parsed = safeJsonParseFn(cleaned)
      if (attempt > 0) {
        console.log('[batchPrompt] JSON.parse 重试成功', { attempt, cleanedLength: cleaned.length })
      }
      return parsed
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      console.warn('[batchPrompt] JSON.parse 失败，原始 content 前500字符=', fullRaw.slice(0, 500))
      console.warn('[batchPrompt] JSON.parse 失败详情', {
        attempt,
        message: lastError.message,
        cleanedPreview: cleaned.slice(0, 300),
      })
    }
  }

  console.error('[batchPrompt] JSON.parse 最终失败，原始内容前2000字符=', fullRaw.slice(0, 2000))
  throw lastError instanceof Error ? lastError : new Error('JSON 解析失败')
}

export const BATCH_SYSTEM_PROMPT = `你是 K12 专业题库拆题引擎，对标学科网组卷网的 AI 识别标准。

【最高优先级：题目完整性 - 零碎片化】
这是一条你必须无条件遵守的硬性规则，优先级高于一切：
- 一道大题 = 一个 JSON 对象。无论该大题包含多少个子问题（(1)(2)(3)…），它们都属于同一道大题，必须放在同一个 content 字段内。
- 题号格式严格区分：
  * 独立大题编号：1. 2. 3. … 每个以"数字+."开头的新段落是独立大题的起点
  * 大题内子问题编号：(1) (2) (3) 或 ① ② ③ 或 a) b) c) — 这些都是子问题，不是新大题
- 如果文本中出现「1. 已知函数 f(x) … (1)求… (2)证明…」→ 这是一个大题对象
- 如果文本中出现「1. … 2. … 3. …」→ 这是三个独立大题对象
- 禁止将一道大题的子问题拆分成多个独立题目对象输出
- 禁止将一道大题的题干内容分散到多个 content 中

【碎片化反面示例 - 严禁出现】
❌ 错误拆分示例：
  输入: "1. 已知数列{an}满足a1=1，an+1=2an+1 (1)求通项公式 (2)求前n项和Sn"
  [{"content":"1. 已知数列{an}满足a1=1，an+1=2an+1 (1)求通项公式"}, {"content":"(2)求前n项和Sn"}]
  这是严重错误！(1)和(2)属于同一道大题的2个子问题，只能输出1个对象。

✅ 正确输出：
  [{"content":"1. 已知数列{an}满足a1=1，an+1=2an+1 (1)求通项公式 (2)求前n项和Sn"}]

【核心要求 - 公式与图形零丢失】
1. 文本中的 ${FORMULA_PLACEHOLDER} 标记代表 MathType/OMML 公式被转换后的占位符
2. 你必须根据上下文**推断公式内容**，并以标准 LaTeX 格式写出
3. 行内公式用 $...$，独立公式用 $$...$$
4. 禁止输出 ${FORMULA_PLACEHOLDER} 标记本身 —— 必须替换为实际 LaTeX 公式
5. 禁止遗漏、简化、改写任何公式符号（包括上下标、根号、分数、积分、矩阵等）
6. 根据题目的数学语境推断：如数列题中的【公式】通常是 $a_n$、$S_n$、$d$、$q$ 等
7. 几何图形、函数图像用 geometry_desc 字段详细描述（形状、标记、坐标、标注）
8. 无法识别的图片在 content 中插入 ${IMAGE_PLACEHOLDER}，analysis 说明「此题包含图片，需手动处理」
9. 表格内容完整保留，用 Markdown 表格或 geometry_desc 描述

【输出格式 - 必须严格遵守】
1. 只输出一个 JSON 数组，以 [ 开头、以 ] 结尾
2. 禁止 markdown 代码块（禁止 \`\`\`json）
3. 禁止用对象包装（禁止 {"questions":[...]} 或 {"data":{...}}）
4. 每道题必须是对象，且必须包含字符串字段：content、answer、analysis
5. 无题目时输出空数组 []
6. 禁止在 JSON 外输出任何说明文字

【内容规则】
1. content：题干全文（含所有子问题、公式、图形描述、表格），禁止省略
2. answer：标准答案（含公式，禁止"略"或"见解析"）
3. analysis：详细解析（含公式推导步骤）
4. options：选择题为字符串数组；非选择题为 []
5. geometry_desc：图形描述（无图形则为 ""）
6. latex_blocks：本题涉及的所有 LaTeX 片段数组（不含 $ 分隔符）
7. question_type：选择题/填空题/计算题/证明题/实验题/应用题
8. difficulty：基础/中等/拔高
9. knowledge_point：知识点名称（如"一元二次方程"）
10. tags：相关标签数组（如 ["二次函数", "最值问题"]）
11. 一题一条，禁止合并多道小题`

export function buildBatchSplitPrompt(chunkText, meta) {
  const estimated = meta.estimatedQuestions ?? 0
  const countHint = estimated >= 2
    ? `\n【题量要求】本片段约含 ${estimated} 道题（检测到 ${estimated} 个题号）。必须逐题识别并输出，JSON 数组长度必须等于片段内独立题目数量，禁止只输出 1 题后停止。\n`
    : '\n【题量要求】必须识别片段中的每一道独立题目，JSON 数组长度等于实际题目数，禁止遗漏或合并。\n'

  return `将以下试卷文本拆分为独立题目，完整保留数学表达式与图形信息。
${countHint}
${COMPLETE_EXTRACTION_RULE}

学科：${meta.subject || '数学'}
年级：${meta.grade || '八年级'}

${LATEX_STRICT_RULE}

${IMAGE_PLACEHOLDER_RULE}

【公式处理要求 - 零丢失】
- 文本中的 ${FORMULA_PLACEHOLDER} 标记代表原始文档中的 MathType 公式
- 你必须根据上下文推断每个 ${FORMULA_PLACEHOLDER} 的具体内容
- 所有推断出的公式必须转换为标准 LaTeX 格式
- 行内公式：$公式内容$
- 独立公式（单独成行）：$$公式内容$$
- 常见公式推断示例：
  - 数列题「${FORMULA_PLACEHOLDER}」→ $a_n$ 或 $S_n$ 或 $d$（根据位置判断）
  - 函数题「${FORMULA_PLACEHOLDER}」→ $f(x)$ 或具体表达式
  - 二次方程 → $ax^2+bx+c=0$
  - 分数 → $\\frac{分子}{分母}$
  - 根号 → $\\sqrt{表达式}$
  - 积分 → $\\int_a^b f(x)dx$
- 禁止保留 ${FORMULA_PLACEHOLDER} 标记，必须替换为 LaTeX
- 禁止将公式简化为文字描述
- 对于确实无法推断的公式，使用描述性 LaTeX 占位（如 $\\text{未知公式}$）

【图形处理要求】
- 如有几何图形、函数图像，在 geometry_desc 字段中详细描述
- 无法识别的图片使用 ${IMAGE_PLACEHOLDER} 插入 content，并在 analysis 注明需手动处理
- 描述内容：图形类型、标记条件、角度/边长数值、坐标位置
- 示例："图：直角三角形 ABC，∠C=90°，AC=3，BC=4，求 AB"

试卷片段：
${chunkText}

【输出要求】直接输出 JSON 数组，格式示例（含 LaTeX 与图片占位符）：
${JSON_EXAMPLE_WITH_LATEX}

每道题必须包含 content、answer、analysis。只输出 JSON 数组，不要任何其他文字。`
}

/** 备用 prompt（backupPrompt）：极度明确，必须且只能返回纯 JSON 数组 */
export function backupPrompt(chunkText, meta) {
  const estimated = meta.estimatedQuestions ?? 0
  const countHint = estimated >= 2
    ? `\n本片段约含 ${estimated} 道独立大题（题号 1. 2. 3. …）。注意：每道大题可能包含(1)(2)(3)子问题，这些子问题必须在同一个JSON对象中，不要拆分。JSON数组长度 = 独立大题数 = ${estimated}。\n`
    : '\n必须输出片段内全部题目，JSON数组长度等于实际独立大题数。禁止将子问题(1)(2)(3)拆成多道题。\n'

  return `【强制 JSON 数组模式 - 违反任何一条均视为失败】
${countHint}
${COMPLETE_EXTRACTION_RULE}

【题目完整性 - 不可违反】
- 一道大题包含多个(1)(2)(3)子问题时，所有子问题必须在同一个对象的 content 中
- 只按独立大题编号（1. 2. 3. …）拆分，不按子问题编号（(1) (2) (3)）拆分

你的输出必须且只能是一个 JSON 数组，以字符 [ 开头、以字符 ] 结尾。
禁止输出 markdown（禁止 \`\`\`json）。
禁止用对象包装（禁止 {"questions":[...]}、禁止 {"data":{...}}、禁止 {"result":{...}}）。
禁止输出任何 JSON 以外的文字、说明、注释。

${LATEX_STRICT_RULE}

${IMAGE_PLACEHOLDER_RULE}

【公式保留 - 最高优先级】
- 所有数学公式必须完整保留为 LaTeX 格式
- 行内公式：$...$
- 独立公式：$$...$$
- 对于题目中出现的所有数学、物理、化学公式，你必须原样保留其 LaTeX 格式（例如 $$...$$ 或 $...$），不得转换为纯文本或乱码
- 禁止遗漏任何公式符号，禁止将公式转为文字描述
- 即使 AI 无法识别的公式，也要用描述性 LaTeX 占位（如 $\\text{公式图像}$）

学科：${meta.subject || '数学'}
年级：${meta.grade || '八年级'}

试卷文本：
${chunkText}

每道题必须是 JSON 对象，且必须包含以下字符串字段（均不能为空）：
- content（题干，含完整公式）
- answer（答案，含完整公式）
- analysis（解析，含完整公式推导）

可选字段：question_type、difficulty、options、knowledge_point、geometry_desc、latex_blocks、tags

【唯一合法输出格式示例（含 LaTeX 与图片占位符）】：
${JSON_EXAMPLE_WITH_LATEX}
`
}

/** @deprecated 使用 backupPrompt */
export function buildBatchSplitFallbackPrompt(chunkText, meta) {
  return backupPrompt(chunkText, meta)
}

function isQuestionLike(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false
  return Boolean(
    obj.content || obj.question || obj.题干 || obj.title || obj.stem
    || obj.answer || obj.答案 || obj.correct_answer
    || (Array.isArray(obj.options) && obj.options.length)
    || (Array.isArray(obj.choices) && obj.choices.length),
  )
}

function isQuestionArray(arr) {
  return Array.isArray(arr) && arr.length > 0 && arr.some(isQuestionLike)
}

/** 深度搜索嵌套对象中的题目数组 */
export function deepFindQuestionArrays(node, depth = 0, maxDepth = 8) {
  if (depth > maxDepth || node == null) return []

  if (isQuestionArray(node)) return node.filter(Boolean)

  if (Array.isArray(node)) {
    for (const item of node) {
      const found = deepFindQuestionArrays(item, depth + 1, maxDepth)
      if (found.length) return found
    }
    return []
  }

  if (typeof node === 'object') {
    const priorityKeys = [
      'questions', 'question_list', 'questions_list', 'items', 'data',
      'result', 'results', 'output', 'response', 'list', 'payload',
      'choices', 'message', 'messages', 'content', 'body', 'text',
      'answer', 'completion', 'delta', 'tool_calls', 'function_call',
      '题目', '试题', 'exam_questions', 'parsed_questions',
    ]
    for (const key of priorityKeys) {
      if (key in node) {
        const found = deepFindQuestionArrays(node[key], depth + 1, maxDepth)
        if (found.length) return found
      }
    }
    for (const val of Object.values(node)) {
      const found = deepFindQuestionArrays(val, depth + 1, maxDepth)
      if (found.length) return found
    }
  }

  if (typeof node === 'string' && node.trim()) {
    try {
      const inner = JSON.parse(node.trim())
      return deepFindQuestionArrays(inner, depth + 1, maxDepth)
    } catch {
      return []
    }
  }

  return []
}

export function extractQuestionsFromAiRaw(raw, { logWarnings = true } = {}) {
  if (typeof raw === 'string' && raw.trim()) {
    const cleaned = preprocessAiJsonString(raw)
    const candidates = [cleaned, raw.trim()].filter(Boolean)
    const seen = new Set()
    for (const candidate of candidates) {
      if (seen.has(candidate)) continue
      seen.add(candidate)
      try {
        const inner = JSON.parse(candidate)
        const extracted = extractQuestionsFromAiRaw(inner, { logWarnings: false })
        if (extracted.length) {
          if (logWarnings) {
            console.log('[batchPrompt] 题目提取路径', { path: 'string_json_parse_cleaned', count: extracted.length })
          }
          return extracted
        }
      } catch {
        // 尝试下一个候选
      }
    }
    if (logWarnings) {
      console.warn(`[Prompt] 无法解析 AI 响应，原始内容前500字符=${raw.slice(0, 500)}`)
    }
    return []
  }

  if (Array.isArray(raw)) {
    if (isQuestionArray(raw)) return raw.filter(Boolean)
    const merged = []
    for (const item of raw) {
      merged.push(...extractQuestionsFromAiRaw(item, { logWarnings: false }))
    }
    if (merged.length) return merged
    return raw.filter((x) => x && typeof x === 'object')
  }

  if (!raw || typeof raw !== 'object') return []

  const topKeys = [
    'questions', 'question_list', 'items', 'data', 'result', 'results',
    'output', 'response', 'list', 'choices', 'message', 'messages',
    'content', 'body', 'text', '题目', '试题',
  ]
  for (const key of topKeys) {
    const val = raw[key]
    if (val == null) continue
    const extracted = extractQuestionsFromAiRaw(val, { logWarnings: false })
    if (extracted.length) {
      if (logWarnings) console.log('[batchPrompt] 题目提取路径', { path: key, count: extracted.length })
      return extracted
    }
  }

  // data.questions / data.result / result.questions 等二层嵌套
  if (raw.data && typeof raw.data === 'object') {
    for (const subKey of ['questions', 'items', 'result', 'list', '题目']) {
      if (raw.data[subKey]) {
        const extracted = extractQuestionsFromAiRaw(raw.data[subKey], { logWarnings: false })
        if (extracted.length) {
          if (logWarnings) console.log('[batchPrompt] 题目提取路径', { path: `data.${subKey}`, count: extracted.length })
          return extracted
        }
      }
    }
  }
  if (raw.result && typeof raw.result === 'object') {
    for (const subKey of ['questions', 'items', 'data', 'list']) {
      if (raw.result[subKey]) {
        const extracted = extractQuestionsFromAiRaw(raw.result[subKey], { logWarnings: false })
        if (extracted.length) {
          if (logWarnings) console.log('[batchPrompt] 题目提取路径', { path: `result.${subKey}`, count: extracted.length })
          return extracted
        }
      }
    }
  }

  const values = Object.values(raw)
  if (values.length > 0 && values.every((v) => v && typeof v === 'object' && !Array.isArray(v) && isQuestionLike(v))) {
    return values
  }

  if (isQuestionLike(raw)) return [raw]

  const deep = deepFindQuestionArrays(raw)
  if (deep.length) {
    if (logWarnings) console.log('[batchPrompt] 题目提取路径', { path: 'deepFindQuestionArrays', count: deep.length })
    return deep
  }

  if (logWarnings) {
    console.warn('[batchPrompt] extractQuestionsFromAiRaw 未识别结构', {
      keys: Object.keys(raw),
      sample: JSON.stringify(raw).slice(0, 300),
    })
  }
  return []
}

export function normalizeBatchQuestions(raw, meta, startOrder = 0) {
  const list = extractQuestionsFromAiRaw(raw)
  return list.map((q, i) => ({
    subject: q.subject || meta.subject || '数学',
    grade: q.grade || meta.grade || '八年级',
    knowledge_point: q.knowledge_point || q.knowledgePoint || '未分类',
    question_type: q.question_type || q.type || '应用题',
    difficulty: q.difficulty || '中等',
    content: String(q.content || q.question || q.题干 || q.title || q.stem || `题目 ${startOrder + i + 1}`),
    options: Array.isArray(q.options) ? q.options : Array.isArray(q.choices) ? q.choices : [],
    answer: String(q.answer || q.correct_answer || q.答案 || '暂无'),
    analysis: String(q.analysis || q.explanation || q.解析 || '暂无'),
    geometry_desc: String(q.geometry_desc || q.geometryDesc || ''),
    latex_blocks: Array.isArray(q.latex_blocks) ? q.latex_blocks : Array.isArray(q.latexBlocks) ? q.latexBlocks : [],
    question_number: String(q.question_number ?? q.questionNumber ?? q.number ?? startOrder + i + 1),
    source: '批量拆题',
    tags: Array.isArray(q.tags) ? q.tags : [],
    sort_order: Number.isFinite(Number(q.sort_order)) ? Number(q.sort_order) : startOrder + i + 1,
  }))
}

/**
 * 从 AI 原始文本解析题目
 * @returns {Promise<{ questions: object[], rawQuestions: object[], extractPath: string, parsed: unknown }>}
 */
export async function parseBatchSplitAiResponse(aiText, meta, sortOffset, extractJson, safeJsonParse) {
  const chatContent = extractDeepSeekChatContent(aiText)
  const rawText = chatContent || String(aiText ?? '')
  const rawPreview500 = rawText.slice(0, 500)
  const rawPreview1000 = rawText.slice(0, 1000)

  if (chatContent && chatContent !== String(aiText ?? '').trim()) {
    console.log('[batchPrompt] 已从 DeepSeek choices.message.content 提取文本', {
      extractLength: chatContent.length,
      preview500: chatContent.slice(0, 500),
    })
  }

  if (!rawText.trim()) {
    console.warn('[batchWorker] AI 响应为空')
    console.warn(`[Prompt] 无法解析 AI 响应，原始内容前500字符=${rawPreview500}`)
    return { questions: [], rawQuestions: [], extractPath: 'empty_response', parsed: null }
  }

  const attempts = []
  let parsed = null
  let parseSource = ''

  const jsonCandidates = [
    { label: 'preprocessAiJsonString', text: preprocessAiJsonString(rawText) },
    { label: 'extractJsonFromAiText', text: extractJsonFromAiText(rawText) },
  ]
  if (typeof extractJson === 'function') {
    jsonCandidates.push({ label: 'extractJson', text: extractJson(rawText) })
  }
  jsonCandidates.push({ label: 'raw_trim', text: rawText.trim() })

  for (const { label, text } of jsonCandidates) {
    if (!text) {
      attempts.push(`${label}:empty`)
      continue
    }
    try {
      parsed = await parseJsonFromAiTextWithRetry(text, safeJsonParse)
      parseSource = label
      attempts.push(`${label}:ok`)
      break
    } catch (err) {
      attempts.push(`${label}:${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // 最后一搏：对整个原始文本带重试解析
  if (parsed == null) {
    try {
      parsed = await parseJsonFromAiTextWithRetry(rawText, safeJsonParse)
      parseSource = 'parseJsonFromAiTextWithRetry_full'
      attempts.push('parseJsonFromAiTextWithRetry_full:ok')
    } catch (err) {
      attempts.push(`parseJsonFromAiTextWithRetry_full:${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const topKeysBefore = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? Object.keys(parsed)
    : Array.isArray(parsed) ? [`array(${parsed.length})`] : [typeof parsed]
  console.log('[Worker] 提取题目，原始数据字段=' + topKeysBefore.join(','))

  if (parsed == null) {
    console.warn(`[Prompt] 无法解析 AI 响应，原始 content 前500字符=${rawPreview500}`)
    console.warn('[batchWorker] JSON 解析全部失败，2秒后重试一次', { attempts, parseSource, rawPreview1000 })
    await sleep(JSON_PARSE_RETRY_DELAY_MS)
    try {
      parsed = await parseJsonFromAiTextWithRetry(preprocessAiJsonString(rawText), safeJsonParse)
      parseSource = 'retry_after_json_fail'
      attempts.push('retry_after_json_fail:ok')
    } catch (retryErr) {
      attempts.push(`retry_after_json_fail:${retryErr instanceof Error ? retryErr.message : String(retryErr)}`)
      console.warn('[batchWorker] JSON 解析重试仍失败', { attempts, rawPreview500 })
      throw new Error(`AI 响应 JSON 解析失败（attempts=${attempts.join('; ')}）`)
    }
  }

  console.log('[batchWorker] JSON 解析成功', { parseSource, attempts })

  let rawQuestions = extractQuestionsFromAiRaw(parsed)
  let extractPath = rawQuestions.length ? 'extractQuestionsFromAiRaw' : ''

  if (!rawQuestions.length) {
    console.warn('[batchWorker] 主路径提取为空，尝试 deepFindQuestionArrays', {
      parsedType: Array.isArray(parsed) ? 'array' : typeof parsed,
      topKeys: topKeysBefore,
    })
    rawQuestions = deepFindQuestionArrays(parsed)
    extractPath = rawQuestions.length ? 'deepFindQuestionArrays' : extractPath
  }

  // 新增：尝试常见混合字段组合
  if (!rawQuestions.length && parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    // 尝试 parsed.data.questions / parsed.result.questions / parsed.output.questions
    for (const prefix of ['data', 'result', 'output', 'body']) {
      if (!parsed[prefix]) continue
      const sub = parsed[prefix]
      if (Array.isArray(sub)) {
        rawQuestions = sub.filter(q => q && typeof q === 'object')
        if (rawQuestions.length) { extractPath = prefix + '[array]'; break }
      }
      if (sub && typeof sub === 'object') {
        for (const k of ['questions', 'items', 'list', 'results']) {
          if (!sub[k]) continue
          const arr = Array.isArray(sub[k]) ? sub[k] : null
          if (arr && arr.length) {
            rawQuestions = arr.filter(q => q && typeof q === 'object')
            if (rawQuestions.length) { extractPath = prefix + '.' + k; break }
          }
        }
      }
      if (rawQuestions.length) break
    }
  }

  if (!rawQuestions.length && Array.isArray(parsed)) {
    rawQuestions = parsed.filter((x) => x && typeof x === 'object')
    if (rawQuestions.length) extractPath = 'array_filter_objects'
  }

  if (!rawQuestions.length && typeof parsed === 'string') {
    rawQuestions = extractQuestionsFromAiRaw(parsed)
    if (rawQuestions.length) extractPath = 'parsed_string_reextract'
  }

  const topKeysAfter = rawQuestions.length
    ? ['extracted_questions']
    : (parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? Object.keys(parsed) : topKeysBefore)
  console.log('[Worker] 提取题目，原始数据字段=' + topKeysAfter.join(',') + ` (count=${rawQuestions.length})`)

  if (!rawQuestions.length) {
    console.warn(`[Prompt] 无法解析 AI 响应，原始内容前500字符=${rawPreview500}`)
    console.warn('[batchWorker] 所有提取路径均为空', {
      attempts,
      parsedType: typeof parsed,
      parsedIsArray: Array.isArray(parsed),
      parsedKeys: parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? Object.keys(parsed).slice(0, 20) : [],
      parsedPreview: JSON.stringify(parsed).slice(0, 500),
      rawPreview500,
    })
    return { questions: [], rawQuestions: [], extractPath: 'all_paths_empty', parsed, rawPreview1000, attempts }
  }

  const questions = normalizeBatchQuestions(rawQuestions, meta, sortOffset)
  console.log('[batchWorker] 题目提取成功', { extractPath, rawCount: rawQuestions.length, normalizedCount: questions.length })
  return { questions, rawQuestions, extractPath, parsed, rawPreview1000, attempts }
}
