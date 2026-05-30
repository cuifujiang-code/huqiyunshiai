/** 专业教育题库拆题 Prompt：LaTeX 公式、几何图形、空间图形全支持 */

export const BATCH_SYSTEM_PROMPT = `你是 K12 专业题库拆题引擎。

【输出格式 - 必须严格遵守】
1. 只输出一个 JSON 数组，以 [ 开头、以 ] 结尾
2. 禁止 markdown 代码块（禁止 \`\`\`json）
3. 禁止用对象包装（禁止 {"questions":[...]} 或 {"data":{...}}）
4. 每道题必须是对象，且必须包含字符串字段：content、answer、analysis
5. 无题目时输出空数组 []

【内容规则】
1. 数学公式使用 LaTeX，行内 $...$，独立公式 $$...$$
2. geometry_desc 描述图形要素；无图形则为 ""
3. latex_blocks 为 LaTeX 片段数组（不含 $）
4. 选择题 options 为字符串数组；非选择题 options 为 []
5. question_type：选择题/填空题/计算题/证明题/实验题/应用题
6. difficulty：基础/中等/拔高
7. 一题一条，不要合并多道小题`

export function buildBatchSplitPrompt(chunkText, meta) {
  return `将以下试卷文本拆分为独立题目，完整保留数学表达式与图形信息。

学科：${meta.subject || '数学'}
年级：${meta.grade || '八年级'}

试卷片段：
${chunkText}

【输出要求】直接输出 JSON 数组，格式示例（仅示意结构，题目数量按实际文本）：
[
  {
    "subject": "数学",
    "grade": "八年级",
    "knowledge_point": "一元一次方程",
    "question_type": "应用题",
    "difficulty": "中等",
    "content": "题干文字…",
    "options": [],
    "answer": "答案…",
    "analysis": "解析…",
    "geometry_desc": "",
    "latex_blocks": [],
    "tags": []
  }
]

每道题必须包含 content、answer、analysis。只输出 JSON 数组，不要任何其他文字。`
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

  const topKeys = ['questions', 'question_list', 'items', 'data', 'result', 'results', 'output', 'list', '题目', '试题']
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
 * 从 AI 原始文本解析题目：打印前 500 字符，多路径尝试提取
 * @returns {{ questions: object[], rawQuestions: object[], extractPath: string, parsed: unknown }}
 */
export function parseBatchSplitAiResponse(aiText, meta, sortOffset, extractJson, safeJsonParse) {
  const rawPreview = String(aiText ?? '').slice(0, 500)
  console.log('[batchWorker] AI 原始响应前500字符:', rawPreview)

  if (!String(aiText ?? '').trim()) {
    console.warn('[batchWorker] AI 响应为空')
    return { questions: [], rawQuestions: [], extractPath: 'empty_response', parsed: null }
  }

  const attempts = []
  const jsonCandidates = [
    extractJson(aiText),
    String(aiText).trim(),
  ]

  let parsed = null
  for (const candidate of jsonCandidates) {
    if (!candidate) continue
    try {
      parsed = safeJsonParse(candidate)
      attempts.push('json_parse_ok')
      break
    } catch (err) {
      attempts.push(`json_parse_fail:${err instanceof Error ? err.message : String(err)}`)
    }
  }

  if (parsed == null) {
    console.warn('[batchWorker] JSON 解析全部失败', { attempts, preview: rawPreview })
    return { questions: [], rawQuestions: [], extractPath: 'json_parse_failed', parsed: null }
  }

  let rawQuestions = extractQuestionsFromAiRaw(parsed)
  let extractPath = rawQuestions.length ? 'extractQuestionsFromAiRaw' : ''

  if (!rawQuestions.length) {
    console.warn('[batchWorker] 主路径提取为空，尝试 deepFindQuestionArrays', {
      parsedType: Array.isArray(parsed) ? 'array' : typeof parsed,
      topKeys: parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? Object.keys(parsed) : [],
    })
    rawQuestions = deepFindQuestionArrays(parsed)
    extractPath = rawQuestions.length ? 'deepFindQuestionArrays' : extractPath
  }

  if (!rawQuestions.length && Array.isArray(parsed)) {
    rawQuestions = parsed.filter((x) => x && typeof x === 'object')
    if (rawQuestions.length) extractPath = 'array_filter_objects'
  }

  if (!rawQuestions.length) {
    console.warn('[batchWorker] 所有提取路径均为空', {
      attempts,
      parsedPreview: JSON.stringify(parsed).slice(0, 400),
    })
    return { questions: [], rawQuestions: [], extractPath: 'all_paths_empty', parsed }
  }

  const questions = normalizeBatchQuestions(rawQuestions, meta, sortOffset)
  console.log('[batchWorker] 题目提取成功', { extractPath, rawCount: rawQuestions.length, normalizedCount: questions.length })
  return { questions, rawQuestions, extractPath, parsed }
}
