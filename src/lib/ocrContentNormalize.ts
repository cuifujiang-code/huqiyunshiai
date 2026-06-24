/**
 * OCR / LaTeX 文本预处理 — 修复乱码并准备 KaTeX 渲染
 */

const LATEX_CMD =
  'frac|sqrt|begin|end|left|right|overrightarrow|overline|triangle|times|leq|geq|le|ge|vec|lambda|mu|in|subseteq|Rightarrow|Leftrightarrow|cdot|infty|to|sum|int|alpha|beta|gamma|pi|Delta|Omega|pm|text|mathrm|mathbf|cases|aligned|gather|matrix|pmatrix|bmatrix|array|displaystyle'

const LATEX_HINT = new RegExp(`\\\\(?:${LATEX_CMD})`)

const DISPLAY_ENVS = 'cases|aligned|gather|matrix|pmatrix|bmatrix|array'

/** 修复 OCR 常见乱码与标签换行 */
export function preprocessOcrContent(text: string): string {
  if (!text?.trim()) return ''
  let s = String(text)

  s = s.replace(/\uFF04/g, '$')
  s = s.replace(/\\backslash\s*/g, '\n')
  s = s.replace(/\bo\\(?=[\s+\-]|$)/g, 'o $\\to$ ')
  s = s.replace(/\\intfty/g, '\\infty')
  s = s.replace(/\[(题目|解答|板书|提示)\]/g, '\n\n[$1]\n')

  s = repairMissingBackslashes(s)
  s = fixDoubleEscapedCommands(s)

  return s.replace(/\n{3,}/g, '\n\n').trim()
}

/** 修复 OCR 丢失的前导反斜杠（ imes → \times） */
export function repairMissingBackslashes(text: string): string {
  let s = text
  const rules: [RegExp, string][] = [
    [/(?<![\\a-zA-Z])overrightarrow(?=\{)/g, '\\overrightarrow'],
    [/(?<![\\a-zA-Z])triangle(?![a-zA-Z])/g, '\\triangle'],
    [/(?<![\\a-zA-Z])imes(?![a-zA-Z])/g, '\\times'],
    [/(?<![\\a-zA-Z])cdot(?![a-zA-Z])/g, '\\cdot'],
    [/(?<![\\a-zA-Z])lambda(?![a-zA-Z])/g, '\\lambda'],
    [/(?<![\\a-zA-Z])infty(?![a-zA-Z])/g, '\\infty'],
    [/(?<![\\a-zA-Z])subseteq(?![a-zA-Z])/g, '\\subseteq'],
    [/(?<![\\a-zA-Z])Rightarrow(?![a-zA-Z])/g, '\\Rightarrow'],
    [/(?<![\\a-zA-Z])Leftrightarrow(?![a-zA-Z])/g, '\\Leftrightarrow'],
    [/(?<![\\a-zA-Z])geq(?![a-zA-Z])/g, '\\geq'],
    [/(?<![\\a-zA-Z])leq(?![a-zA-Z])/g, '\\leq'],
    [/(?<![\\a-zA-Z])frac(?=\{)/g, '\\frac'],
    [/(?<![\\a-zA-Z])sqrt(?=[\{\[])/g, '\\sqrt'],
    [/(?<![\\a-zA-Z])begin(?=\{)/g, '\\begin'],
    [/(?<![\\a-zA-Z])end(?=\{)/g, '\\end'],
    [/(?<![\\a-zA-Z])left(?=[(\[|.])/g, '\\left'],
    [/(?<![\\a-zA-Z])right(?=[)\]|.])/g, '\\right'],
    [/(?<![\\a-zA-Z])vec(?=\{)/g, '\\vec'],
    [/(?<![\\a-zA-Z])in(?=[\[(\s,;]|$)/g, '\\in'],
    [/(?<![\\a-zA-Z])to(?![a-zA-Z])/g, '\\to'],
    [/(?<![a-zA-Z\\])riangleq/g, '\\triangleq'],
    [/(?<![\\a-zA-Z])riangle(?!q)/g, '\\triangle'],
  ]
  for (const [re, rep] of rules) s = s.replace(re, rep)
  return s
}

/** 修复 JSON 双转义命令（\\frac → \frac），但保留 cases 内换行 \\ */
export function fixDoubleEscapedCommands(text: string): string {
  return text.replace(new RegExp(`\\\\\\\\(${LATEX_CMD})`, 'g'), '\\$1')
}

/** \(...\) / \[...\] → $...$ / $$...$$（必须在环境包裹之前执行） */
export function normalizeLatexDelimiters(text: string): string {
  let s = text
  s = s.replace(/\\\[([\s\S]*?)\\\]/g, (_, inner) => `$$${inner.trim()}$$`)
  s = s.replace(/\\\(([\s\S]*?)\\\)/g, (_, inner) => `$${inner.trim()}$`)
  return s
}

function isInsideDollarMath(text: string, pos: number): boolean {
  let i = 0
  let inInline = false
  let inBlock = false
  while (i < pos) {
    if (!inInline && !inBlock && text[i] === '$' && text[i + 1] === '$') {
      inBlock = !inBlock
      i += 2
      continue
    }
    if (!inBlock && text[i] === '$') {
      inInline = !inInline
      i += 1
      continue
    }
    i += 1
  }
  return inInline || inBlock
}

/** 将未包裹的 cases/矩阵环境包裹为 $$ 块级公式（跳过已在 $ 定界符内的） */
export function wrapDisplayEnvironments(text: string): string {
  const re = new RegExp(`\\\\begin\\{(${DISPLAY_ENVS})\\}[\\s\\S]*?\\\\end\\{\\1\\}`, 'g')
  let result = ''
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    result += text.slice(last, m.index)
    const block = m[0]
    if (isInsideDollarMath(text, m.index)) {
      result += block
    } else {
      result += `\n$$\n${block.trim()}\n$$\n`
    }
    last = m.index + block.length
  }
  result += text.slice(last)
  return result
}

/** 行内 $ 中的 cases/矩阵等块级环境 → 提升为 $$ */
export function promoteInlineDisplayEnvironments(text: string): string {
  const hasDisplayEnv = new RegExp(`\\\\begin\\{(${DISPLAY_ENVS})\\}`)
  return text.replace(/\$([^$\n]+)\$/g, (full, inner) => {
    if (hasDisplayEnv.test(inner)) {
      return `\n$$\n${inner.trim()}\n$$\n`
    }
    return full
  })
}

/** 对单行/片段做 KaTeX 渲染前最后一轮修复 */
export function repairLatexSnippet(latex: string): string {
  let s = latex.trim()
  s = repairMissingBackslashes(s)
  s = fixDoubleEscapedCommands(s)
  s = s.replace(/\\begin\{cases\}([\s\S]*?)\\end\{cases\}/g, (_, body) => {
    const fixed = body
      .replace(/([^\\])\s\\(?!\\)(?=\s*[a-zA-Z])/g, '$1\\\\')
      .replace(/^\s\\(?!\\)(?=\s*[a-zA-Z])/gm, '\\\\')
    return `\\begin{cases}${fixed}\\end{cases}`
  })
  return s
}

/** 检测文本是否含有已正确格式化的 LaTeX 定界符 */
function hasProperLatex(text: string): boolean {
  return /\$\$[\s\S]*?\$\$/.test(text) || /\$[^$\n]+?\$/.test(text)
}

/** 完整渲染前预处理管线 */
export function prepareLatexContent(text: string): string {
  if (!text) return ''

  const hasLatex = hasProperLatex(text)

  // 已包含 $...$ 或 $$...$$ 定界符 → 内容已格式化，跳过 OCR 修复（防英文词污染）
  let s = hasLatex ? String(text) : preprocessOcrContent(text)

  s = s.replace(/\\n(?![a-zA-Z])/g, '\n').replace(/\\t(?![a-zA-Z])/g, ' ')
  // 先统一定界符，再处理环境包裹，避免 \(...\) 内的 cases 被拆碎
  s = normalizeLatexDelimiters(s)
  s = promoteInlineDisplayEnvironments(s)
  s = wrapDisplayEnvironments(s)

  if (!s.includes('$') && LATEX_HINT.test(s)) {
    s = s
      .split('\n')
      .map((line) => {
        const t = line.trim()
        if (!t || t.startsWith('[')) return line
        if (LATEX_HINT.test(t) && /[\u4e00-\u9fff]/.test(t)) {
          return line.replace(
            new RegExp(`(\\\\(?:${LATEX_CMD})[\\s\\S]*?(?=\\s*[\\u4e00-\\u9fff]|$))`, 'g'),
            (m) => `$${m.trim()}$`,
          )
        }
        if (LATEX_HINT.test(t)) return `$$${t}$$`
        return line
      })
      .join('\n')
  }

  return s
}
