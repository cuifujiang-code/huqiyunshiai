/**
 * 豆包视觉 OCR — 拍照搜题、答题卡诊断等通用场景
 */
import { callDoubaoVisionAI, isDoubaoConfigured } from './doubaoClient.js'

export class DoubaoVisionOcrError extends Error {
  constructor(message, detail = {}) {
    super(message)
    this.name = 'DoubaoVisionOcrError'
    this.detail = detail
  }

  toJSON() {
    return { name: this.name, message: this.message, detail: this.detail }
  }
}

export { isDoubaoConfigured as isDoubaoVisionOcrConfigured }

const PHOTO_SEARCH_VISION_SYSTEM = `你是 K12 拍照搜题 OCR 专家。请仔细查看题目图片，提取完整题干文字。

要求：
- 保留题号、选项、公式（LaTeX：行内 $...$，独立 $$...$$）
- 图表用文字简要描述
- 只输出识别正文，不要解释或 JSON`

const ANSWER_SHEET_VISION_SYSTEM = `你是 K12 学生答题卡/试卷手写 OCR 专家。请识别图片中的手写答案与批注。

要求：
- 按题号顺序输出，保留「第N题」等结构
- 公式用 LaTeX（$...$ / $$...$$）
- 看不清处标注 (?)
- 只输出识别正文，不要 JSON`

function requireDoubaoVision() {
  if (!isDoubaoConfigured()) {
    throw new DoubaoVisionOcrError(
      '豆包视觉 OCR 未配置：请在环境变量中设置 DOUBAO_API_KEY 与 DOUBAO_VISION_MODEL（ep- 推理接入点）',
    )
  }
}

/** 拍照搜题：单张题目图片 → 文字 */
export async function recognizePhotoQuestionDoubao(
  base64,
  { fileName = 'photo.jpg', mimeType = 'image/jpeg' } = {},
) {
  requireDoubaoVision()
  if (!base64?.trim()) {
    throw new DoubaoVisionOcrError(`图片 ${fileName} 数据为空`)
  }

  try {
    const text = await callDoubaoVisionAI(
      PHOTO_SEARCH_VISION_SYSTEM,
      `请识别这张题目图片（${fileName}）的完整文字内容，输出原文。`,
      base64,
      mimeType,
      { label: 'Doubao-PhotoSearch-OCR', timeoutMs: 90000 },
    )
    console.log('[DoubaoVisionOCR] 拍照搜题识别完成', { fileName, textLength: text.length })
    return text.trim()
  } catch (err) {
    throw new DoubaoVisionOcrError(err instanceof Error ? err.message : '豆包视觉 OCR 失败', {
      fileName,
    })
  }
}

/** 单张答题卡 Base64 → 手写文字（与阿里云 OCR 接口对齐） */
export async function recognizeHandwritingBase64Doubao(base64, { fileName = 'image', mimeType = 'image/jpeg' } = {}) {
  requireDoubaoVision()
  if (!base64?.trim()) {
    throw new DoubaoVisionOcrError(`图片 ${fileName} 数据为空`)
  }

  try {
    const text = await callDoubaoVisionAI(
      ANSWER_SHEET_VISION_SYSTEM,
      `请识别这张答题卡/手写答卷图片（${fileName}）的全部手写内容。`,
      base64,
      mimeType,
      { label: 'Doubao-Diagnosis-OCR', timeoutMs: 120000 },
    )
    console.log('[DoubaoVisionOCR] 答题卡识别完成', { fileName, textLength: text.length })
    return text.trim()
  } catch (err) {
    throw new DoubaoVisionOcrError(err instanceof Error ? err.message : '豆包视觉 OCR 失败', {
      fileName,
    })
  }
}

const MIN_PAGE_CHARS = 10
const MIN_TOTAL_CHARS = 30

/** 多张答题卡识别并合并（与 alibabaHandwritingOcr 返回结构一致） */
export async function recognizeHandwritingImagesDoubao(images, onProgress) {
  requireDoubaoVision()
  const parts = []

  for (let i = 0; i < images.length; i++) {
    const img = images[i]
    onProgress?.(i + 1, images.length, img.name)

    const text = await recognizeHandwritingBase64Doubao(img.base64, {
      fileName: img.name,
      mimeType: img.mimeType || 'image/jpeg',
    })
    parts.push({
      index: i + 1,
      name: img.name,
      text: text.trim(),
    })
  }

  const combinedText = parts
    .map((p) => `--- 答题卡第 ${p.index} 张（${p.name}）---\n${p.text || '（未识别到文字）'}`)
    .join('\n\n')

  const incomplete =
    combinedText.length < MIN_TOTAL_CHARS ||
    parts.some((p) => p.text.length < MIN_PAGE_CHARS)

  return { combinedText, incomplete, pageCount: parts.length }
}
