/** 批量拆题质量相关 Prompt 片段（LaTeX / 图片占位符） */

export const IMAGE_PLACEHOLDER = '[图片占位符]'

export const LATEX_STRICT_RULE = `【LaTeX 公式 - 极其严格】
对于题目中出现的所有数学、物理、化学公式，你必须原样保留其 LaTeX 格式（例如 $$...$$ 或 $...$），不得转换为纯文本或乱码。
- 行内公式：$E=mc^2$、$\\lambda=\\frac{h}{p}$
- 独立公式：$$\\int_0^1 x^2 dx$$
- 禁止把公式改成 Unicode 近似符号或口语描述
- 原文已是 LaTeX 的必须一字不改地保留`

export const IMAGE_PLACEHOLDER_RULE = `【图片占位 - 必须遵守】
对于题目中你无法识别或未提供的图片/图表/函数图像：
- 在 content 字段中该图片位置插入标准占位符 ${IMAGE_PLACEHOLDER}
- 在 analysis 字段中说明「此题包含图片，需手动处理」
- 同时在 geometry_desc 中用文字描述图形要点（若可推断）`

export const JSON_EXAMPLE_WITH_LATEX = `[
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
