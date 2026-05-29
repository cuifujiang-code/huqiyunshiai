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

export function normalizeBatchQuestions(raw, meta, startOrder = 0) {
  const list = Array.isArray(raw) ? raw : raw?.questions ?? []
  return list.map((q, i) => ({
    subject: q.subject || meta.subject || '数学',
    grade: q.grade || meta.grade || '八年级',
    knowledge_point: q.knowledge_point || '',
    question_type: q.question_type || '应用题',
    difficulty: q.difficulty || '中等',
    content: String(q.content || `题目 ${startOrder + i + 1}`),
    options: Array.isArray(q.options) ? q.options : [],
    answer: String(q.answer || ''),
    analysis: String(q.analysis || ''),
    geometry_desc: String(q.geometry_desc || ''),
    latex_blocks: Array.isArray(q.latex_blocks) ? q.latex_blocks : [],
    source: '批量拆题',
    tags: Array.isArray(q.tags) ? q.tags : [],
    sort_order: startOrder + i,
  }))
}
