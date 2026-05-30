/** 专业教育题库拆题 Prompt：LaTeX 公式、几何图形、空间图形全支持 */

export const BATCH_SYSTEM_PROMPT = `你是 K12 专业题库拆题引擎，输出严格 JSON，禁止 markdown 代码块。

规则：
1. 数学公式必须使用 LaTeX，行内用 $...$，独立公式用 $$...$$
2. 含几何图、空间图、函数图形的题目，在 geometry_desc 字段用中文精确描述图形要素（点、线、角、坐标、立体结构）
3. 将 latex_blocks 数组列出本题所有 LaTeX 片段（不含 $ 符号）
4. 选择题 options 为字符串数组；非选择题 options 为空数组
5. question_type 只能是：选择题/填空题/计算题/证明题/实验题/应用题
6. difficulty 只能是：基础/中等/拔高
7. 一题一条记录，不要合并多道小题`

export function buildBatchSplitPrompt(chunkText, meta) {
  return `请将以下试卷文本拆分为独立题目，完整保留数学表达式与图形信息。

学科：${meta.subject || '数学'}
年级：${meta.grade || '八年级'}

试卷片段：
${chunkText}

输出 JSON 数组，每项字段：
- subject, grade, knowledge_point
- question_type, difficulty
- content（题干，含 LaTeX）
- options（选择题选项数组，否则 []）
- answer（含 LaTeX）
- analysis（解析，含 LaTeX）
- geometry_desc（无图形则空字符串）
- latex_blocks（LaTeX 字符串数组）
- tags（字符串数组）

只输出 JSON 数组。`
}

export function extractQuestionsFromAiRaw(raw) {
  if (Array.isArray(raw)) return raw.filter(Boolean)
  if (!raw || typeof raw !== 'object') return []

  const arrayKeys = ['questions', 'data', 'items', 'results', 'list', '题目', '试题', 'questions_list']
  for (const key of arrayKeys) {
    const val = raw[key]
    if (Array.isArray(val) && val.length) return val.filter(Boolean)
  }

  // AI 有时返回 { "1": {...}, "2": {...} }
  const values = Object.values(raw)
  if (values.length > 0 && values.every((v) => v && typeof v === 'object' && !Array.isArray(v))) {
    return values
  }

  // 单题对象
  if (raw.content || raw.question || raw.题干 || raw.title) {
    return [raw]
  }

  return []
}

export function normalizeBatchQuestions(raw, meta, startOrder = 0) {
  const list = extractQuestionsFromAiRaw(raw)
  if (!list.length && raw && typeof raw === 'object' && !Array.isArray(raw)) {
    console.warn('[batchPrompt] extractQuestionsFromAiRaw 未识别结构', {
      keys: Object.keys(raw),
      sample: JSON.stringify(raw).slice(0, 200),
    })
  }
  return list.map((q, i) => ({
    subject: q.subject || meta.subject || '数学',
    grade: q.grade || meta.grade || '八年级',
    knowledge_point: q.knowledge_point || q.knowledgePoint || '未分类',
    question_type: q.question_type || q.type || '应用题',
    difficulty: q.difficulty || '中等',
    content: String(q.content || q.question || q.题干 || q.title || `题目 ${startOrder + i + 1}`),
    options: Array.isArray(q.options) ? q.options : Array.isArray(q.choices) ? q.choices : [],
    answer: String(q.answer || q.correct_answer || q.答案 || ''),
    analysis: String(q.analysis || q.explanation || q.解析 || ''),
    geometry_desc: String(q.geometry_desc || q.geometryDesc || ''),
    latex_blocks: Array.isArray(q.latex_blocks) ? q.latex_blocks : Array.isArray(q.latexBlocks) ? q.latexBlocks : [],
    question_number: String(q.question_number ?? q.questionNumber ?? q.number ?? startOrder + i + 1),
    source: '批量拆题',
    tags: Array.isArray(q.tags) ? q.tags : [],
    sort_order: Number.isFinite(Number(q.sort_order)) ? Number(q.sort_order) : startOrder + i + 1,
  }))
}
