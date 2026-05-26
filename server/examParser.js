import mammoth from 'mammoth'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const pdfParse = require('pdf-parse')

const MAX_EXAM_FILE_BYTES = 8 * 1024 * 1024

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
  if (lower.endsWith('.docx')) {
    const result = await mammoth.extractRawText({ buffer })
    const text = (result.value || '').trim()
    if (!text) throw new Error('Word 试卷未能提取到文字，请检查文件内容')
    console.log('[试卷解析] Word 完成', { fileName, textLength: text.length })
    return { text, type: 'docx' }
  }

  if (lower.endsWith('.pdf')) {
    const data = await pdfParse(buffer)
    const text = (data.text || '').trim()
    if (!text) throw new Error('PDF 试卷未能提取到文字，请检查是否为扫描版 PDF')
    console.log('[试卷解析] PDF 完成', { fileName, textLength: text.length, pages: data.numpages })
    return { text, type: 'pdf' }
  }

  throw new Error('标准试卷仅支持 .docx 和 .pdf 格式')
}
