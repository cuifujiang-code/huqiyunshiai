/** 批量拆题质量相关 Prompt 片段（LaTeX / 图片占位符） */

export const IMAGE_PLACEHOLDER = '[图片占位符]'
export const FORMULA_PLACEHOLDER = '【公式】'

export const LATEX_STRICT_RULE = `【LaTeX 公式 - 极其严格】
文本中的 ${FORMULA_PLACEHOLDER} 标记代表原始文档中此处有一个数学公式（MathType/OMML）。
你必须根据上下文推断该公式的内容，并以标准 LaTeX 格式写出：
- 行内公式使用 $...$ 包裹，如 $a_n$、$S_n$、$\\frac{a}{b}$
- 独立公式（单独成行）使用 $$...$$ 包裹
- 常见数学符号：下标用 _，上标用 ^，分数用 \\frac{}{}，根号用 \\sqrt{}
- 矩阵用 \\begin{pmatrix}...\\end{pmatrix}
- 禁止把公式改成 Unicode 近似符号或口语描述
- 禁止输出 ${FORMULA_PLACEHOLDER} 标记本身（必须替换为 LaTeX）
- 根据题目的数学语境准确推断公式含义
示例：
  输入「数列${FORMULA_PLACEHOLDER}的通项」→ 输出「数列 $a_n$ 的通项」
  输入「${FORMULA_PLACEHOLDER}」在等式上下文中 → 输出「$S_n = a_1 + a_2 + ... + a_n$」`

export const IMAGE_PLACEHOLDER_RULE = `【图片占位 - 必须遵守】
对于题目中你无法识别或未提供的图片/图表/函数图像：
- 在 content 字段中该图片位置插入标准占位符 ${IMAGE_PLACEHOLDER}
- 在 analysis 字段中说明「此题包含图片，需手动处理」
- 同时在 geometry_desc 中用文字描述图形要点（若可推断）
- 禁止省略图片占位符，禁止将图片描述为文字内容`

export const JSON_EXAMPLE_WITH_LATEX = `[
  {
    "content": "已知数列 ${FORMULA_PLACEHOLDER} 满足 ${FORMULA_PLACEHOLDER}，${FORMULA_PLACEHOLDER}，求 ${FORMULA_PLACEHOLDER} 的通项公式。",
    "answer": "$a_n = 2n - 1$",
    "analysis": "由 $a_1 = 1$，$a_{n+1} = a_n + 2$ 可知，数列 $\\{a_n\\}$ 是首项为 1、公差为 2 的等差数列，故 $a_n = 1 + 2(n-1) = 2n - 1$。",
    "question_type": "计算题",
    "difficulty": "中等",
    "knowledge_point": "等差数列",
    "options": [],
    "geometry_desc": "",
    "latex_blocks": ["a_n = 2n - 1", "a_{n+1} = a_n + 2", "a_1 = 1"]
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
