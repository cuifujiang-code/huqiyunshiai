import mammoth from 'mammoth'
import { createRequire } from 'node:module'
import { logStepError } from './apiErrorUtil.js'

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

async function parsePdf(buffer, fileName) {
  console.log('[试卷解析] 开始 PDF', { fileName, bytes: buffer.length })
  const pdfParse = getPdfParse()
  const data = await pdfParse(buffer)
  const text = (data.text || '').trim()
  if (!text) {
    throw new Error('PDF 试卷未能提取到文字，请检查是否为扫描版 PDF（需 OCR 版 PDF 或改用 Word）')
  }
  console.log('[试卷解析] PDF 完成', {
    fileName,
    textLength: text.length,
    pages: data.numpages,
  })
  return { text, type: 'pdf' }
}

/**
 * 解析标准试卷：Word(.docx) 或 PDF
 */
export async function parseExamFile(buffer, fileName) {
  if (!buffer?.length) {
    throw new Error('试卷文件为空')
  }
  if (buffer.length > MAX_EXAM_FILE_BYTES) {
    throw new Error('试卷文件过大，请上传 8MB 以内的文件')
  }

  const lower = (fileName || '').toLowerCase()

  try {
    if (lower.endsWith('.docx')) {
      return await parseDocx(buffer, fileName)
    }
    if (lower.endsWith('.pdf')) {
      return await parsePdf(buffer, fileName)
    }
    throw new Error('标准试卷仅支持 .docx 和 .pdf 格式')
  } catch (error) {
    logStepError('exam-parse', error)
    throw error
  }
}
