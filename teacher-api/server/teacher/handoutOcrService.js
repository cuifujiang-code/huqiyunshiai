/**
 * 手写 PDF/图片 → 讲义 JSON（豆包视觉 OCR + 结构化）
 */
import { saveHandout } from './handoutStore.js'
import { workbuddyJsonToHandoutContent } from './handoutImport.js'
import { processHandoutOcrImages } from './handoutDoubaoOcr.js'

/**
 * POST /api/ocr/handwriting-to-handout 主流程
 */
export async function handwritingToHandout(input) {
  const {
    teacherId,
    pageImages = [],
    workbuddyJson,
    title,
    subject,
    grade,
    mode = 'custom',
    saveToDb = true,
    teacherName,
  } = input

  if (!teacherId?.trim()) throw new Error('缺少 teacherId')

  let wbJson = workbuddyJson
  let ocrText = null
  let ocrProvider = 'workbuddy-json'

  if (!wbJson) {
    if (!pageImages?.length) {
      throw new Error('请提供 pageImages（PDF 各页 PNG Base64）或 workbuddyJson')
    }
    const ocrResult = await processHandoutOcrImages(pageImages, { title, subject, grade })
    wbJson = ocrResult.workbuddyJson
    ocrText = ocrResult.ocrText
    ocrProvider = ocrResult.provider
  }

  const content = workbuddyJsonToHandoutContent(wbJson, { title, subject, grade, teacherName })
  if (ocrProvider === 'doubao-vision' || ocrProvider === 'deepseek-vision') {
    content.ocrMeta = {
      ...(content.ocrMeta || {}),
      source: ocrProvider,
      provider: ocrProvider === 'doubao-vision' ? 'doubao' : 'deepseek',
      importedAt: new Date().toISOString(),
    }
  }

  const record = {
    title: content.title,
    mode: mode || 'custom',
    content,
  }

  if (saveToDb) {
    const saved = await saveHandout(teacherId.trim(), record)
    return { handout: saved, content, workbuddyJson: wbJson, ocrText, provider: ocrProvider }
  }

  return { content, workbuddyJson: wbJson, ocrText, provider: ocrProvider }
}
