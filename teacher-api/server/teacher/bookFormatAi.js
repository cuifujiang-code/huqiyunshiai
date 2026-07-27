/**
 * 辅导书 OCR 内容 — AI 排版校准与 LaTeX 纠错
 */
import { callDoubaoAI, isDoubaoConfigured } from '../doubaoClient.js'
import { callDeepSeekAI, extractJson } from '../deepseekClient.js'
import { repairJSON } from '../batch/jsonRepairEngine.js'

const CHUNK_SIZE = 6

function flattenBlocks(chapters = []) {
  const items = []
  chapters.forEach((ch, ci) => {
    ch.sections?.forEach((sec, si) => {
      sec.blocks?.forEach((b, bi) => {
        items.push({
          ref: `${ci}.${si}.${bi}`,
          type: b.type,
          title: b.title,
          content: String(b.content || ''),
        })
      })
    })
  })
  return items
}

function applyFormattedBlocks(chapters, formattedBlocks) {
  const map = new Map(formattedBlocks.map((b) => [b.ref, b]))
  return chapters.map((ch, ci) => ({
    ...ch,
    sections: (ch.sections || []).map((sec, si) => ({
      ...sec,
      blocks: (sec.blocks || []).map((b, bi) => {
        const hit = map.get(`${ci}.${si}.${bi}`)
        if (!hit) return b
        return {
          ...b,
          title: hit.title ?? b.title,
          content: hit.content ?? b.content,
          missingAnswer: hit.hasAnswer === false ? true : b.missingAnswer,
        }
      }),
    })),
  }))
}

function parseFormatJson(raw) {
  try {
    return JSON.parse(extractJson(raw))
  } catch {
    return JSON.parse(repairJSON(raw))
  }
}

async function callFormatAi(systemPrompt, userPrompt) {
  if (isDoubaoConfigured()) {
    return callDoubaoAI(systemPrompt, userPrompt, {
      label: 'Doubao-Book-Format',
      timeoutMs: 120000,
    })
  }
  return callDeepSeekAI(systemPrompt, userPrompt)
}

const SYSTEM_INSTRUCTION = `你是一个专业的数学教辅书排版助手。

特别重要的规则：
1. 原文中若出现"【公式】"、"false"、或类似占位符，这代表一个数学公式（MathType OLE 对象或 OCR 错误）。
2. 你必须根据上下文数学含义，推断并替换为正确的 LaTeX 公式。
3. 替换规则：
   - 行内公式用 $...$ 包裹
   - 独立公式（居中）用 $$...$$ 包裹
   - 确保 LaTeX 语法正确（KaTeX 兼容）
4. 示例：
   - "解得 false = 0" → "解得 $x = 0$"
   - "如图 false 所示" → "如图所示" (若无法推断则删除)
5. 绝对不能保留"false"或"【公式】"在原稿中。`

const FORMAT_SYSTEM = `${SYSTEM_INSTRUCTION}

你是 K12 教辅排版与 LaTeX 校对专家。审核 OCR 识别后的题目文本，输出更清晰、符合教辅规范的排版。
只输出合法 JSON，不要 markdown 代码块。`

function buildFormatPrompt(blocks, meta) {
  return `元信息：${JSON.stringify({ title: meta.title, subject: meta.subject, grade: meta.grade, level: meta.level })}

待排版块（OCR 原文，可能有识别错误）：
${JSON.stringify(blocks)}

排版与纠错规则（必须遵守）：
1. 保留并规范区域标签：[题目]、[解答]、[板书]、[提示]，每个标签单独一行
2. 题目格式：题号+题干 → 空行 → 小问 (1)(2) 分行；解答按步骤换行，关键结论独立成行
3. 数学公式一律用 LaTeX：行内 $...$，独立一行或大型公式 $$...$$
4. 修复常见 OCR 错误：误识别的 \\backslash、\\times 与 \\triangle 混淆、丢失反斜杠（imes→\\times、riangle→\\triangle）、\\vec 前多余 \\、o\\ 改为 $\\to$、\\intfty→\\infty
5. cases 环境内换行必须用 \\\\（双反斜杠），不可写成单个 \\
6. 保留 [FIGURE:...] 图形位置标记与 <img> 标签，不要删除或改写
7. 中文与公式之间留空格；不要删除任何实质数学内容

只输出 JSON：
{
  "blocks": [
    { "ref": "0.0.0", "title": "题目20", "content": "排版后的正文（含 $...$ 与换行）", "hasAnswer": true }
  ]
}

JSON 字符串内反斜杠写成双反斜杠（如 \\\\frac）。`
}

/** AI 排版校准 — 分块处理全书 blocks */
export async function formatBookLayoutWithAi({ chapters = [], subject, title, grade, level } = {}) {
  const all = flattenBlocks(chapters)
  if (!all.length) return chapters

  const meta = { subject, title, grade, level }
  const formatted = []

  for (let i = 0; i < all.length; i += CHUNK_SIZE) {
    const chunk = all.slice(i, i + CHUNK_SIZE).map((b) => ({
      ...b,
      content: b.content.slice(0, 4000),
    }))
    const raw = await callFormatAi(FORMAT_SYSTEM, buildFormatPrompt(chunk, meta))
    const parsed = parseFormatJson(raw)
    if (Array.isArray(parsed.blocks)) {
      formatted.push(...parsed.blocks)
    }
  }

  if (!formatted.length) return chapters
  return applyFormattedBlocks(chapters, formatted)
}
