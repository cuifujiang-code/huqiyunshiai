/**
 * 手写 PDF/图片 → 讲义 JSON（阿里云 OCR + DeepSeek 结构化）
 */
import { recognizeHandwritingHttp } from '../alibabaOcrHttp.js'
import { callDeepSeekAI, extractJson } from '../deepseekClient.js'
import { saveHandout } from './handoutStore.js'
import { workbuddyJsonToHandoutContent } from './handoutImport.js'

/** 多页 OCR 合并文本 */
export async function ocrPageImages(images) {
  const parts = []
  for (let i = 0; i < images.length; i++) {
    const img = images[i]
    const text = await recognizeHandwritingHttp(img.base64, { fileName: img.name || `page-${i + 1}.png` })
    parts.push(`--- 第 ${i + 1} 页 ---\n${text.trim() || '（未识别到文字）'}`)
  }
  return parts.join('\n\n')
}

/** DeepSeek 将 OCR 文本结构化为 WorkBuddy 兼容 JSON */
export async function structureOcrToWorkbuddyJson(ocrText, meta = {}) {
  const prompt = `你是 K12 手写解析整理专家。将以下 OCR 手写内容整理为讲义 JSON。

元信息：${JSON.stringify(meta)}

OCR 原文：
${ocrText.slice(0, 12000)}

输出 JSON（不要 markdown）：
{
  "version": "1.0",
  "source": "workbuddy",
  "title": "讲义标题",
  "subject": "学科",
  "modules": [
    {
      "type": "knowledge|example|exercise|summary",
      "title": "模块标题",
      "content": "正文（含题目与解析）",
      "answer": "答案或空字符串",
      "hasAnswer": true
    }
  ]
}

规则：按知识点讲解、例题、练习、总结分类；无答案则 hasAnswer=false。`

  const raw = await callDeepSeekAI('只输出 JSON', prompt)
  return JSON.parse(extractJson(raw))
}

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

  if (!wbJson) {
    if (!pageImages?.length) {
      throw new Error('请提供 pageImages（PDF 各页 PNG Base64）或 workbuddyJson')
    }
    const ocrText = await ocrPageImages(pageImages)
    wbJson = await structureOcrToWorkbuddyJson(ocrText, { title, subject, grade })
  }

  const content = workbuddyJsonToHandoutContent(wbJson, { title, subject, grade, teacherName })
  const record = {
    title: content.title,
    mode: mode || 'custom',
    content,
  }

  if (saveToDb) {
    const saved = await saveHandout(teacherId.trim(), record)
    return { handout: saved, content, workbuddyJson: wbJson }
  }

  return { content, workbuddyJson: wbJson }
}
