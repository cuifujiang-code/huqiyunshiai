import './applyUrlShim.js'
import mammoth from 'mammoth'
import { createRequire } from 'node:module'
import { logStepError } from './apiErrorUtil.js'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'

const require = createRequire(import.meta.url)

const MAX_EXAM_FILE_BYTES = 8 * 1024 * 1024

/** 懒加载 pdf-parse，绕过 index.js 在 Serverless 下误触发测试代码的问题 */
let pdfParseFn = null

function getPdfParse() {
  if (!pdfParseFn) {
    pdfParseFn = require('pdf-parse/lib/pdf-parse.js')
  }
  if (typeof pdfParseFn !== 'function') {
    throw new Error('pdf-parse 模块加载异常，请检查依赖安装')
  }
  return pdfParseFn
}

/** 判断文件是否为图片格式 */
function isImageFile(filename) {
  if (!filename) return false
  const ext = path.extname(filename).toLowerCase()
  return ['.png', '.jpg', '.jpeg', '.bmp', '.gif', '.webp', '.tiff', '.tif'].includes(ext)
}

/** 判断是否为 WPS Office 格式（.wps / .et / .dps） */
function isWpsFile(filename) {
  if (!filename) return false
  const ext = path.extname(filename).toLowerCase()
  return ['.wps', '.et', '.dps'].includes(ext)
}

/**
 * 用 Tesseract.js 对图片做 OCR
 * 对标学科网"拍照录入"OCR能力
 */
async function ocrImage(filePath, lang = 'chi_sim+eng') {
  console.log('[OCR] 开始识别', { filePath: filePath.slice(0, 80), lang })
  try {
    const Tesseract = (await import('tesseract.js')).default
    const result = await Tesseract.recognize(filePath, lang, {
      logger: (m) => {
        if (m.status === 'recognizing text') {
          console.log('[OCR] 进度', { status: m.status, progress: Math.round((m.progress || 0) * 100) + '%' })
        }
      },
    })
    const text = String(result.data.text || '').trim()
    const confidence = Number(result.data.confidence) || 0
    console.log('[OCR] 识别完成', { charCount: text.length, confidence })
    return { text, confidence }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[OCR] 识别失败', { error: msg })
    throw new Error(`OCR 识别失败：${msg}`)
  }
}

/**
 * 解析 WPS 文件：重命名为 .docx 后用 mammoth 解析
 * WPS Office 文件本质是 OOXML（同 .docx），可直接用 mammoth 处理
 */
async function parseWpsFile(buffer, fileName) {
  console.log('[examParser] 检测到 WPS 格式，尝试以 DOCX 方式解析', { fileName })
  const tmpPath = path.join(os.tmpdir(), `wps_${Date.now()}.docx`)
  try {
    await fs.writeFile(tmpPath, buffer)
    const { value } = await mammoth.extractRawText({ path: tmpPath })
    console.log('[examParser] WPS 解析成功（mammoth 路径）', { charCount: value.length })
    return { text: value, type: 'wps' }
  } catch (err) {
    console.warn('[examParser] WPS mammoth 路径失败', { error: err instanceof Error ? err.message : String(err) })
    // 直接对 buffer 用 mammoth（部分 .wps 可直接识别）
    try {
      const { value } = await mammoth.extractRawText({ buffer })
      return { text: value, type: 'wps' }
    } catch (err2) {
      throw new Error(`WPS 文件解析失败：${err2 instanceof Error ? err2.message : String(err2)}`)
    }
  } finally {
    try { await fs.unlink(tmpPath) } catch {}
  }
}

/**
 * 用 Vision AI（DeepSeek 多模态）识别手写图片/数学公式
 * 对标学科网"拍照录入"功能
 */
async function parseImageWithVision(buffer, fileName, meta = {}) {
  console.log('[examParser] Vision AI 识别图片', { fileName })
  try {
    const { callDeepSeekVisionAI } = await import('./deepseekClient.js')
    const base64 = buffer.toString('base64')
    const ext = path.extname(fileName || '').toLowerCase()
    const mimeMap = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.bmp': 'image/bmp',
    }
    const mimeType = mimeMap[ext] || 'image/png'

    const visionPrompt = `请识别图片中的全部题目文字，完整保留数学公式（使用 LaTeX 格式，行内公式用 $...$，独立公式用 $$...$$）、选项、答案和解析。

要求：
1. 逐题输出，每题包含：题干（content）、选项（options，选择题必填，格式为 JSON 数组）、答案（answer）、解析（analysis）
2. 数学公式必须准确转换为 LaTeX，禁止遗漏公式符号
3. 表格、图形描述用 geometry_desc 字段补充
4. 如图片包含多道题，用序号或【题目 N】分隔
5. 直接输出纯文本或 JSON 数组，不输出 markdown 代码块

学科：${meta.subject || '数学'}
年级：${meta.grade || '八年级'}`

    const aiText = await callDeepSeekVisionAI(base64, mimeType, visionPrompt, {
      model: process.env.DEEPSEEK_VISION_MODEL || 'deepseek-chat',
      maxTokens: 4096,
    })

    if (!aiText || !aiText.trim()) {
      console.warn('[examParser] Vision AI 返回空，回退 OCR')
      const tmpPath = path.join(os.tmpdir(), `vision_${Date.now()}${ext || '.png'}`)
      await fs.writeFile(tmpPath, buffer)
      try {
        const ocrResult = await ocrImage(tmpPath, 'chi_sim+eng')
        if (ocrResult.text.length > 20) return { text: ocrResult.text, type: 'image_ocr' }
      } finally {
        try { await fs.unlink(tmpPath) } catch {}
      }
      throw new Error('Vision AI 和 OCR 均未能识别图片内容')
    }

    console.log('[examParser] Vision AI 识别成功', { charCount: aiText.length })
    return { text: aiText, type: 'image_vision' }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[examParser] Vision AI 识别失败，回退 OCR', { error: msg })

    // 回退：Tesseract OCR
    const tmpPath = path.join(os.tmpdir(), `vision_${Date.now()}${path.extname(fileName || '.png')}`)
    await fs.writeFile(tmpPath, buffer)
    try {
      const ocrResult = await ocrImage(tmpPath, 'chi_sim+eng')
      if (ocrResult.text.length > 20) {
        console.log('[examParser] OCR 回退成功', { charCount: ocrResult.text.length })
        return { text: ocrResult.text, type: 'image_ocr' }
      }
    } catch (ocrErr) {
      console.error('[examParser] OCR 回退也失败', { error: ocrErr instanceof Error ? ocrErr.message : String(ocrErr) })
    } finally {
      try { await fs.unlink(tmpPath) } catch {}
    }

    throw new Error(`图片识别失败（Vision AI 和 OCR 均失败）：${msg}`)
  }
}

/** 解析 .docx */
async function parseDocx(buffer, fileName) {
  console.log('[试卷解析] 开始 Word', { fileName, bytes: buffer.length })
  const result = await mammoth.extractRawText({ buffer })
  const text = (result.value || '').trim()
  if (!text) {
    throw new Error('Word 试卷未能提取到文字，请检查文件内容')
  }
  console.log('[试卷解析] Word 完成', { fileName, textLength: text.length })
  return { text, type: 'docx' }
}

/** 解析 .pdf（含扫描版 PDF 检测 + OCR 回退） */
async function parsePdf(buffer, fileName) {
  console.log('[试卷解析] 开始 PDF', { fileName, bytes: buffer.length })
  const pdfParse = getPdfParse()
  const data = await pdfParse(buffer)
  const text = (data.text || '').trim()
  console.log('[试卷解析] PDF 完成', {
    fileName,
    textLength: text.length,
    pages: data.numpages,
  })

  // 文字层内容过少 → 判定为扫描版 PDF
  if (!text || text.length < 100) {
    console.warn('[examParser] PDF 文字层内容过少，判定为扫描版 PDF')
    throw new Error(
      '检测到扫描版 PDF（无文字层），暂不支持自动 OCR。请将 PDF 导出为图片后上传，或使用"拍照录入"功能上传图片。',
    )
  }

  return { text, type: 'pdf' }
}

/**
 * 解析标准试卷：Word(.docx) / PDF / WPS(.wps) / 图片（手写/拍照）
 * 对标学科网组卷网"拍照录入"+"AI智能识别"能力
 *
 * @param {Buffer} buffer 文件二进制数据
 * @param {string} fileName 原始文件名（用于判断格式）
 * @param {object} [meta] {{ subject, grade }} 学科/年级元数据
 * @returns {Promise<{ text: string, type: string }>}
 */
export async function parseExamFile(buffer, fileName, meta = {}) {
  if (!buffer?.length) {
    throw new Error('试卷文件为空')
  }
  if (buffer.length > MAX_EXAM_FILE_BYTES) {
    throw new Error('试卷文件过大，请上传 8MB 以内的文件')
  }

  const lower = (fileName || '').toLowerCase()

  try {
    // 图片格式 → Vision AI + OCR 回退
    if (isImageFile(lower)) {
      console.log('[examParser] 识别为图片格式，调用 Vision AI')
      return await parseImageWithVision(buffer, fileName, meta)
    }

    // WPS 格式 → 重命名后 mammoth
    if (isWpsFile(lower)) {
      console.log('[examParser] 识别为 WPS 格式')
      return await parseWpsFile(buffer, fileName)
    }

    // .docx → mammoth
    if (lower.endsWith('.docx')) {
      return await parseDocx(buffer, fileName)
    }

    // .pdf → pdf-parse；结果为空则判定为扫描版 PDF
    if (lower.endsWith('.pdf')) {
      return await parsePdf(buffer, fileName)
    }

    throw new Error('标准试卷仅支持 .docx、.pdf、.wps 格式和图片（.png/.jpg/.jpeg/.bmp/.webp/.gif）')
  } catch (error) {
    logStepError('exam-parse', error)
    throw error
  }
}
