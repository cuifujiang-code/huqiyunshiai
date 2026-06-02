/** 专业教育题库拆题 Prompt：LaTeX 公式、几何图形、空间图形全支持 */

export const BATCH_SYSTEM_PROMPT = `你是 K12 专业题库拆题引擎，输出严格 JSON 数组，禁止 markdown 代码块，禁止额外解释文字。

核心规则：
1. 数学公式必须使用 LaTeX，行内用 $...$，独立公式用 $$...$$
2. 文本中的 【公式】 占位符表示原始试卷中的数学公式，你需要根据上下文推断并用 LaTeX 补全
3. 含几何图、空间图、函数图形的题目，在 geometry_desc 字段用中文精确描述图形要素
4. 将 latex_blocks 数组列出本题所有 LaTeX 片段（不含 $ 符号）
5. 选择题 options 为字符串数组（含 LaTeX）；非选择题 options 为空数组 []
6. question_type 根据学科选择：
   - 语文：选择题/填空题/阅读理解/文言文阅读/古诗词鉴赏/语言运用/默写/作文/解答题
   - 数学：选择题/填空题/计算题/证明题/解答题/应用题/作图题
   - 英语：选择题/完形填空/阅读理解/七选五/语法填空/短文改错/书面表达/听力
   - 物理：选择题/填空题/实验题/计算题/解答题/作图题
   - 化学：选择题/填空题/实验题/计算题/推断题/解答题
   - 生物：选择题/填空题/实验题/解答题/识图题
   - 历史：选择题/材料分析题/论述题/解答题
   - 地理：选择题/综合题/解答题/读图题
7. difficulty 只能是：基础/中等/拔高
8. 一题一条记录，不要合并多道小题
9. 知识模块 knowledge_point 尽可能具体（如：集合与逻辑、函数与导数、解析几何、立体几何等）
10. 所有字段值不能为 null，至少用空字符串 ""`

export function buildBatchSplitPrompt(chunkText, meta) {
  return `请将以下试卷文本拆分为独立题目，完整保留数学表达式与图形信息。

学科：${meta.subject || '数学'}
年级：${meta.grade || '八年级'}

试卷片段：
${chunkText}

注意：文本中的 【公式】 占位符代表原始试卷中的数学公式（如集合、函数、向量、复数等），请根据上下文推断并用正确的 LaTeX 补全。例如"已知集合【公式】"可能是"已知集合 $A=\\{x|x^2-4x+3\\leq 0\\}$"。

输出 JSON 数组，每项字段：
- subject, grade, knowledge_point
- question_type, difficulty
- content（题干，含 LaTeX，将 【公式】 替换为正确 LaTeX）
- options（选择题选项数组，否则 []）
- answer（含 LaTeX）
- analysis（解析，含 LaTeX）
- geometry_desc（无图形则空字符串）
- latex_blocks（LaTeX 字符串数组）
- tags（字符串数组）

只输出 JSON 数组，不要任何其他文字。`
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
