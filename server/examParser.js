import './applyUrlShim.js'
import mammoth from 'mammoth'
import AdmZip from 'adm-zip'
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

/**
 * 从 docx XML 中提取纯文本，同时将 OMML 公式替换为 【公式】 占位符。
 *
 * 问题：mammoth 默认忽略 Word 数学公式（m:oMath / m:oMathPara），
 *       导致所有数学公式内容完全丢失，AI 无法正确拆题。
 *
 * 方案：
 * 1. 用 AdmZip 解压 docx，读取 word/document.xml
 * 2. 将所有 <m:oMath>...</m:oMath> 替换为 <w:r><w:t>【公式】</w:t></w:r>
 * 3. 将所有 <m:oMathPara>...</m:oMathPara> 替换为 <w:r><w:t>【公式块】</w:t></w:r>
 * 4. 重新打包后交给 mammoth 解析
 *
 * 公式占位符保留，方便 AI 识别公式位置。
 * 后续可结合 Vision API 读取原图补全公式内容。
 */
async function parseDocxWithOMML(buffer, fileName) {
  console.log('[试卷解析] 开始 Word (含公式提取)', { fileName, bytes: buffer.length })

  let text = ''

  try {
    // 1. 读取原始 XML
    const zip = new AdmZip(buffer)
    let docXml = zip.readAsText('word/document.xml')

    const ommlCount = (docXml.match(/<m:oMath>/g) || []).length
    const ommlParaCount = (docXml.match(/<m:oMathPara>/g) || []).length
    console.log('[试卷解析] OMML 公式统计', { fileName, ommlCount, ommlParaCount })

    // 2. 替换 OMML 公式为 Word 文本元素（mammoth 可识别）
    //    先替换 oMathPara（更大范围），再替换 oMath
    let replacedPara = 0
    docXml = docXml.replace(/<m:oMathPara>[\s\S]*?<\/m:oMathPara>/g, () => {
      replacedPara++
      return '<w:r><w:rPr/><w:t xml:space="preserve">【公式块】</w:t></w:r>'
    })

    let replacedMath = 0
    docXml = docXml.replace(/<m:oMath>[\s\S]*?<\/m:oMath>/g, () => {
      replacedMath++
      return '<w:r><w:rPr/><w:t xml:space="preserve">【公式】</w:t></w:r>'
    })

    console.log('[试卷解析] OMML 替换完成', {
      fileName,
      replacedMath,
      replacedPara,
    })

    // 3. 重新打包并交给 mammoth
    const cleanZip = new AdmZip(buffer)
    cleanZip.updateFile('word/document.xml', Buffer.from(docXml, 'utf-8'))
    const cleanBuffer = cleanZip.toBuffer()

    const result = await mammoth.extractRawText({ buffer: cleanBuffer })
    text = (result.value || '').trim()

    if (!text) {
      throw new Error('Word 试卷未能提取到文字，请检查文件内容')
    }

    const formulaMarkers = (text.match(/【公式】/g) || []).length
    console.log('[试卷解析] Word 完成 (含公式占位)', {
      fileName,
      textLength: text.length,
      formulaMarkers,
    })
  } catch (ommlErr) {
    // OMML 解析失败时降级为普通 mammoth 解析
    console.warn('[试卷解析] OMML 解析失败，降级为纯文本', {
      fileName,
      error: ommlErr instanceof Error ? ommlErr.message : String(ommlErr),
    })
    const result = await mammoth.extractRawText({ buffer })
    text = (result.value || '').trim()
    if (!text) {
      throw new Error('Word 试卷未能提取到文字，请检查文件内容')
    }
    console.log('[试卷解析] Word 降级完成', { fileName, textLength: text.length })
  }

  return { text, type: 'docx' }
}

async function parseDocx(buffer, fileName) {
  return parseDocxWithOMML(buffer, fileName)
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
