/**
 * 手写 PDF/图片 → 辅导书章节（豆包视觉 OCR + 结构化）
 */
import { saveBook } from './bookStore.js'
import { ocrJsonToBookContent, countBookBlocks } from './bookImport.js'
import { processBookOcrImages } from './bookDoubaoOcr.js'
import { formatBookLayoutWithAi } from './bookFormatAi.js'
import { cleanBookChapters } from './bookDocxClean.js'

/**
 * POST /api/ocr/handwriting-to-book 主流程
 */
export async function handwritingToBook(input) {
  const {
    teacherId,
    pageImages = [],
    bookJson: inputBookJson,
    workbuddyJson,
    title,
    subject,
    grade,
    level = '基础',
    saveToDb = true,
  } = input

  if (!teacherId?.trim()) throw new Error('缺少 teacherId')

  let bookJson = inputBookJson || workbuddyJson
  let ocrText = null
  let ocrProvider = bookJson ? 'workbuddy-json' : null

  if (!bookJson) {
    if (!pageImages?.length) {
      throw new Error('请提供 pageImages（PDF/图片各页 PNG Base64）或 bookJson / workbuddyJson')
    }
    const ocrResult = await processBookOcrImages(pageImages, { title, subject, grade, level })
    bookJson = { ...ocrResult.bookJson, ocrText: ocrResult.ocrText }
    ocrText = ocrResult.ocrText
    ocrProvider = ocrResult.provider
  }

  let content = ocrJsonToBookContent(bookJson, {
    title,
    grade,
    level,
    source: ocrProvider || 'import',
    ocrText: ocrText || bookJson.ocrText || bookJson.rawText,
  })

  let cleanStats = null
  if (countBookBlocks(content.chapters) > 0) {
    const cleaned = cleanBookChapters(content.chapters)
    content.chapters = cleaned.chapters
    cleanStats = cleaned.stats
  }

  if (countBookBlocks(content.chapters) > 0) {
    try {
      content.chapters = await formatBookLayoutWithAi({
        chapters: content.chapters,
        subject,
        title: content.title,
        grade: content.grade,
        level: content.level,
      })
    } catch (formatErr) {
      console.warn('[bookOcr] AI 排版校准失败，保留原始识别结果', formatErr)
    }
  }

  if (countBookBlocks(content.chapters) === 0) {
    throw new Error('OCR 未识别到可用正文，请换更清晰的 PDF/图片重试')
  }

  const record = {
    title: content.title,
    grade: content.grade,
    level: content.level,
    chapters: content.chapters,
    foreword: content.foreword,
    epilogue: content.epilogue,
    coverStyle: 'academic',
    layoutTemplate: 'classic',
  }

  if (saveToDb) {
    try {
      const saved = await saveBook(teacherId.trim(), record)
      return { book: saved, ...content, bookJson, ocrText, provider: ocrProvider, cleanStats }
    } catch (saveErr) {
      console.error('[bookOcr] 识别成功但保存失败', saveErr)
      return {
        ...content,
        bookJson,
        ocrText,
        provider: ocrProvider,
        saveError: saveErr instanceof Error ? saveErr.message : '保存失败',
        cleanStats,
      }
    }
  }

  return { ...content, bookJson, ocrText, provider: ocrProvider, cleanStats }
}
