/** 批量拆题质量相关 Prompt 片段（LaTeX / 图片占位符） */

export const IMAGE_PLACEHOLDER = '[图片占位符]'
export const FORMULA_PLACEHOLDER = '【公式】'

export const COMPLETE_EXTRACTION_RULE = `【完整提取 - 最高优先级】
- 必须逐字完整复制原文中的题干、条件、数据、选项，禁止省略、概括或用 {...}、{...}、▲、省略号代替任何内容
- 文本中只要有题号（1. 2. 3.）或明显题干，**禁止返回空数组 []**，必须输出题目；含 ${FORMULA_PLACEHOLDER} 时用 LaTeX 推断补全
- 若原文已包含答案或解析，必须原样复制到 answer / analysis，禁止改写或重新生成
- 若原文无解析，再根据上下文补充（禁止写「信息不完整」「无法提供解析」敷衍）
- 选择题的 options 必须是含完整文字的字符串数组，如 ["A. 选项内容", "B. 选项内容"]，禁止只有 "A." "B." 空标签
- 集合、向量、复数等数学对象必须保留原文中的全部元素与条件，禁止简化为 {...}
- 大题含多子问题时：所有 (1)(2)(3)... 子问题必须在同一个 content 字段中，禁止拆成多个独立题目对象
- 表格内容用 [表格]...[/表格] 标记完整保留，行内列用制表符分隔`

export const ANALYSIS_PRESERVATION_RULE = `【解析与答案 - 原样保留】
- 如果题目原文中已包含详细的解析或答案，请原样保留在 analysis 和 answer 字段中，不要用 AI 重新生成
- 只有在原文没有解析或答案时，才由你补充
- 你是题目整理助手，不是题目解答助手
- 禁止将原文已有的标准答案改写成另一种表述`

export const LATEX_STRICT_RULE = `【LaTeX 公式 - 极其严格】
文本中的 ${FORMULA_PLACEHOLDER} 标记代表原始文档中此处有一个数学公式（MathType/OMML）。
你必须根据上下文推断该公式的内容，并以标准 LaTeX 格式写出：
- 行内公式使用 $...$ 包裹，如 $a_n$、$S_n$、$\\frac{a}{b}$
- 独立公式（单独成行）使用 $$...$$ 包裹
- 常见数学符号：下标用 _，上标用 ^，分数用 \\frac{}{}，根号用 \\sqrt{}
- 矩阵用 \\begin{pmatrix}...\\end{pmatrix}
- 禁止把公式改成 Unicode 近似符号或口语描述
- 禁止输出 ${FORMULA_PLACEHOLDER} 标记本身（必须替换为 LaTeX）
- 禁止用 $...$ 或 {...} 作为公式占位符`

export const IMAGE_PLACEHOLDER_RULE = `【图片占位 - 必须遵守】
对于题目中你无法识别或未提供的图片/图表/函数图像：
- 在 content 字段中该图片位置插入标准占位符 ${IMAGE_PLACEHOLDER}
- 在 analysis 字段中说明「此题包含图片，需手动处理」
- 同时在 geometry_desc 中用文字描述图形要点（若可推断）
- 禁止省略图片占位符，禁止将图片描述为文字内容`

export const JSON_EXAMPLE_WITH_LATEX = `[
  {
    "content": "已知数列 ${FORMULA_PLACEHOLDER} 满足 ${FORMULA_PLACEHOLDER}，${FORMULA_PLACEHOLDER}。 (1)求 ${FORMULA_PLACEHOLDER} 的通项公式 (2)求 ${FORMULA_PLACEHOLDER} 的前 n 项和 ${FORMULA_PLACEHOLDER}。",
    "answer": "(1) $a_n = 2n - 1$ (2) $S_n = n^2$",
    "analysis": "(1) 由 $a_1 = 1$，$a_{n+1} = a_n + 2$ 可知，数列 $\\{a_n\\}$ 是首项为 1、公差为 2 的等差数列，故 $a_n = 1 + 2(n-1) = 2n - 1$。(2) 前 n 项和 $S_n = \\\\frac{n(a_1 + a_n)}{2} = \\\\frac{n(1 + 2n - 1)}{2} = n^2$。",
    "question_type": "计算题",
    "difficulty": "中等",
    "knowledge_point": "等差数列",
    "options": [],
    "geometry_desc": "",
    "latex_blocks": ["a_n = 2n - 1", "a_{n+1} = a_n + 2", "a_1 = 1", "S_n = n^2"]
  },
  {
    "content": "已知函数 $f(x)=ax^2+bx+c$，图像如 ${IMAGE_PLACEHOLDER} 所示，求顶点坐标。",
    "answer": "$\\left(-\\frac{b}{2a},\\frac{4ac-b^2}{4a}\\right)$",
    "analysis": "此题包含图片，需手动处理。由配方法得顶点公式…",
    "question_type": "计算题",
    "difficulty": "中等",
    "knowledge_point": "二次函数",
    "options": [],
    "geometry_desc": "抛物线开口向上，与x轴两交点",
    "latex_blocks": ["f(x)=ax^2+bx+c", "\\left(-\\frac{b}{2a},\\frac{4ac-b^2}{4a}\\right)"]
  }
]`
