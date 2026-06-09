/**
 * 手写讲义 OCR — 豆包视觉识别 + 结构化 JSON
 */
import { callDoubaoAI, callDoubaoVisionAI, isDoubaoConfigured } from '../doubaoClient.js'
import { extractJson } from '../deepseekClient.js'

export const HANDOUT_VISION_SYSTEM_PROMPT = `你是 K12 手写讲义 OCR 专家，负责从拍照/扫描的手写页面中精确识别内容。

必须严格遵守：
1. 请将图片中的所有数学公式、符号，用标准 LaTeX 格式（行内公式用 $...$，独立公式用 $$...$$）输出。
2. 请区分出「题目」、「解答」、「板书」等不同区域，并用 [题目]、[解答]、[板书] 等标签进行标注。
3. 对于图片中的几何图形，用文字进行简要描述（如「[图形] 直角三角形 ABC，∠C=90°」）。

输出要求：
- 保留原文顺序，不要遗漏手写内容
- 不确定的字用「(?)」标注
- 只输出识别正文，不要 JSON，不要 markdown 代码块`

const PAGE_USER_PROMPT = (pageIndex, fileName) =>
  `请识别这张手写讲义图片（第 ${pageIndex} 页，文件：${fileName}）。按系统要求输出带区域标签与 LaTeX 的完整文本。`

/** 单页豆包视觉识别 */
export async function recognizeHandoutPageDoubao(imageBase64, { fileName = 'page.png', pageIndex = 1, mimeType = 'image/png' } = {}) {
  if (!isDoubaoConfigured()) {
    throw new Error('DOUBAO_API_KEY 未配置，无法使用豆包视觉 OCR')
  }
  return callDoubaoVisionAI(
    HANDOUT_VISION_SYSTEM_PROMPT,
    PAGE_USER_PROMPT(pageIndex, fileName),
    imageBase64,
    mimeType,
    { label: `Doubao-Handout-OCR-p${pageIndex}`, timeoutMs: 120000 },
  )
}

/** 多页识别合并 */
export async function ocrPageImagesWithDoubao(images = []) {
  const parts = []
  for (let i = 0; i < images.length; i++) {
    const img = images[i]
    const text = await recognizeHandoutPageDoubao(img.base64, {
      fileName: img.name || `page-${i + 1}.png`,
      pageIndex: i + 1,
      mimeType: img.mimeType || 'image/png',
    })
    parts.push(`--- 第 ${i + 1} 页 ---\n${text.trim() || '（未识别到文字）'}`)
  }
  return parts.join('\n\n')
}

/** 将豆包 OCR 文本结构化为 WorkBuddy 兼容 JSON（格式不变） */
export async function structureHandoutOcrToWorkbuddyJson(ocrText, meta = {}) {
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
- content 中保留 $...$ 与 $$...$$ LaTeX`

  const raw = await callDoubaoAI('只输出 JSON，不要 markdown 包裹', prompt, {
    label: 'Doubao-Handout-Structure',
    timeoutMs: 90000,
  })
  return JSON.parse(extractJson(raw))
}

/** 完整 OCR 流程：图片 → 豆包识别 → 结构化 JSON */
export async function processHandoutOcrImages(pageImages, meta = {}) {
  if (!pageImages?.length) throw new Error('请提供 pageImages')
  const ocrText = await ocrPageImagesWithDoubao(pageImages)
  const workbuddyJson = await structureHandoutOcrToWorkbuddyJson(ocrText, meta)
  return { ocrText, workbuddyJson, provider: 'doubao-vision' }
}
