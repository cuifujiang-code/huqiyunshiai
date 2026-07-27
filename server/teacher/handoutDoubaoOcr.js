/**
 * 手写讲义 OCR — 仅豆包视觉识别 + 豆包结构化
 */
import { callDoubaoAI, callDoubaoVisionAI, isDoubaoConfigured, validateDoubaoConnection } from '../doubaoClient.js'
import { extractJson } from '../deepseekClient.js'
import { repairJSON } from '../batch/jsonRepairEngine.js'

const OCR_CONCURRENCY = Math.max(1, Math.min(4, Number(process.env.HANDOUT_OCR_CONCURRENCY || 2)))

export const HANDOUT_VISION_SYSTEM_PROMPT = `你是 K12 手写讲义 OCR 专家，负责从拍照/扫描的手写页面中精确识别内容。

必须严格遵守：
1. 请将图片中的所有数学公式、符号，用标准 LaTeX 格式（行内公式用 $...$，独立公式用 $$...$$）输出。
2. 请区分出「题目」、「解答」、「板书」等不同区域，并用 [题目]、[解答]、[板书] 等标签进行标注。
3. 对于图片中的几何图形，用文字进行简要描述（如「[图形] 直角三角形 ABC，∠C=90°」）。

输出要求：
- 保留原文顺序，不要遗漏手写内容
- 不确定的字用「(?)」标注
- 只输出识别正文，不要 JSON，不要 markdown 代码块`

export const BOOK_VISION_SYSTEM_PROMPT = `你是 K12 教辅辅导书 OCR 专家，负责从拍照/扫描页面中精确识别文字与公式。

必须严格遵守：
1. 数学公式用 LaTeX：行内 $...$，独立一行 $$...$$
2. 用 [题目]、[解答]、[板书]、[提示] 标注区域
3. **遇到几何图形、函数图像、示意图、坐标系图**：不要用文字描述，单独一行输出位置标记：
   [FIGURE:页码:x,y,w,h]
   其中 x,y 为图形左上角相对坐标，w,h 为宽高，均为 0~1 的小数（相对整页图片）。
   例：[FIGURE:1:0.12,0.35,0.76,0.28]
4. 保留原文顺序，不遗漏手写内容
- 只输出识别正文，不要 JSON，不要 markdown 代码块`

const PAGE_USER_PROMPT = (pageIndex, fileName) =>
  `请识别这张手写讲义图片（第 ${pageIndex} 页，文件：${fileName}）。按系统要求输出带区域标签与 LaTeX 的完整文本。`

function requireDoubaoOcr() {
  if (!isDoubaoConfigured()) {
    throw new Error(
      '豆包 OCR 未就绪：请在 .env.local 配置 DOUBAO_API_KEY 与 DOUBAO_VISION_MODEL（ep- 推理接入点 ID）',
    )
  }
}

/** 解析 OCR 提供方（仅豆包） */
export function resolveHandoutOcrProvider() {
  return isDoubaoConfigured() ? 'doubao-vision' : null
}

/** 单页豆包视觉识别 */
export async function recognizeHandoutPageDoubao(
  imageBase64,
  { fileName = 'page.png', pageIndex = 1, mimeType = 'image/png', profile = 'handout' } = {},
) {
  requireDoubaoOcr()
  const systemPrompt = profile === 'book' ? BOOK_VISION_SYSTEM_PROMPT : HANDOUT_VISION_SYSTEM_PROMPT
  return callDoubaoVisionAI(
    systemPrompt,
    PAGE_USER_PROMPT(pageIndex, fileName),
    imageBase64,
    mimeType,
    { label: `Doubao-${profile === 'book' ? 'Book' : 'Handout'}-OCR-p${pageIndex}`, timeoutMs: 120000 },
  )
}

/** 多页识别合并（有限并发，加快多页 PDF） */
export async function ocrPageImagesWithDoubao(images = [], { profile = 'handout' } = {}) {
  requireDoubaoOcr()
  const results = new Array(images.length)

  let cursor = 0
  async function worker() {
    while (cursor < images.length) {
      const i = cursor++
      const img = images[i]
      const text = await recognizeHandoutPageDoubao(img.base64, {
        fileName: img.name || `page-${i + 1}.png`,
        pageIndex: i + 1,
        mimeType: img.mimeType || 'image/png',
        profile,
      })
      results[i] = `--- 第 ${i + 1} 页 ---\n${text.trim() || '（未识别到文字）'}`
    }
  }

  await Promise.all(Array.from({ length: Math.min(OCR_CONCURRENCY, images.length) }, () => worker()))

  return { ocrText: results.join('\n\n'), provider: 'doubao-vision' }
}

function normalizeWorkbuddyShape(data, meta = {}) {
  if (Array.isArray(data)) {
    return {
      version: '1.0',
      source: 'workbuddy',
      title: meta.title || '手写解析讲义',
      subject: meta.subject || '',
      modules: data,
    }
  }
  if (data && typeof data === 'object') {
    const obj = data
    if (!Array.isArray(obj.modules) && Array.isArray(obj.items)) {
      obj.modules = obj.items
    }
    return obj
  }
  throw new Error('结构化结果格式无效')
}

function fallbackWorkbuddyFromOcr(ocrText, meta = {}) {
  return {
    version: '1.0',
    source: 'workbuddy',
    title: meta.title || '手写解析讲义',
    subject: meta.subject || '',
    modules: [
      {
        type: 'knowledge',
        title: '手写解析',
        content: ocrText,
        hasAnswer: false,
      },
    ],
  }
}

function parseStructureJson(raw, meta = {}) {
  try {
    return normalizeWorkbuddyShape(JSON.parse(extractJson(raw)), meta)
  } catch (firstErr) {
    try {
      const repaired = repairJSON(raw)
      return normalizeWorkbuddyShape(repaired, meta)
    } catch (repairErr) {
      console.warn('[handoutOcr] JSON 结构化失败，使用 OCR 原文兜底', {
        first: firstErr instanceof Error ? firstErr.message : firstErr,
        repair: repairErr instanceof Error ? repairErr.message : repairErr,
      })
      return fallbackWorkbuddyFromOcr(meta._ocrText || '', meta)
    }
  }
}

/** 将 OCR 文本结构化为 WorkBuddy 兼容 JSON */
export async function structureHandoutOcrToWorkbuddyJson(ocrText, meta = {}) {
  requireDoubaoOcr()
  const prompt = `你是 K12 手写解析整理专家。将以下豆包视觉 OCR 结果整理为讲义 JSON。

元信息：${JSON.stringify(meta)}

OCR 原文（含 [题目]/[解答]/[板书] 标签与 LaTeX）：
${ocrText.slice(0, 14000)}

只输出 JSON（不要 markdown）：
{
  "version": "1.0",
  "source": "workbuddy",
  "title": "讲义标题",
  "subject": "学科",
  "modules": [
    {
      "type": "knowledge|example|exercise|summary",
      "title": "模块标题",
      "content": "正文（保留 LaTeX 与区域标签）",
      "answer": "答案或空字符串",
      "hasAnswer": true
    }
  ]
}

规则：
- [板书]/知识点 → type=knowledge
- [题目] 例题 → type=example
- [题目] 练习 → type=exercise
- 总结性内容 → type=summary
- 无答案则 hasAnswer=false
- content 中保留 $...$ 与 $$...$$ LaTeX
- JSON 字符串内的反斜杠必须写成双反斜杠（如 \\\\frac），确保输出合法 JSON`

  const raw = await callDoubaoAI('只输出合法 JSON，不要 markdown 包裹', prompt, {
    label: 'Doubao-Handout-Structure',
    timeoutMs: 120000,
  })
  return parseStructureJson(raw, { ...meta, _ocrText: ocrText })
}

/** 完整 OCR 流程：图片 → 豆包识别 → 结构化 JSON */
export async function processHandoutOcrImages(pageImages, meta = {}) {
  if (!pageImages?.length) throw new Error('请提供 pageImages')
  const { ocrText, provider } = await ocrPageImagesWithDoubao(pageImages)
  const workbuddyJson = await structureHandoutOcrToWorkbuddyJson(ocrText, meta)
  return { ocrText, workbuddyJson, provider }
}

export { validateDoubaoConnection }
