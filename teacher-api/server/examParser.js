import './applyUrlShim.js'
import mammoth from 'mammoth'
import { createRequire } from 'node:module'
import { logStepError } from './apiErrorUtil.js'
import { extractImagesFromDocx, extractImagesFromPdf } from './batch/imageExtractor.js'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import AdmZip from 'adm-zip'

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

/** mammoth 无 convertTableToText 选项；通过 convertToHtml 保留表格结构 */
const MAMMOTH_TABLE_OPTIONS = {
  convertTableToText: false,
}

function escapeXmlText(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/** 将 w:tbl XML 转为 [表格] 标记的纯文本（行换行、列制表符） */
function wTblToPlainText(tblXml) {
  const rows = []
  for (const tr of tblXml.matchAll(/<w:tr[\s\S]*?<\/w:tr>/g)) {
    const cells = []
    for (const tc of tr[0].matchAll(/<w:tc[\s\S]*?<\/w:tc>/g)) {
      const cellText = [...tc[0].matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
        .map((m) => m[1]
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&amp;/g, '&'))
        .join('')
      cells.push(cellText.trim())
    }
    if (cells.some(Boolean)) rows.push(cells.join('\t'))
  }
  if (!rows.length) return '[表格]'
  return `[表格]\n${rows.join('\n')}\n[/表格]`
}

/** 在 mammoth 解析前，将 DOCX 表格替换为带 [表格] 标记的文本段落 */
function preserveTablesInDocxXml(xml) {
  return xml.replace(/<w:tbl[\s\S]*?<\/w:tbl>/g, (tblXml) => {
    const tableText = wTblToPlainText(tblXml)
    return `<w:p><w:r><w:t xml:space="preserve">${escapeXmlText(tableText)}</w:t></w:r></w:p>`
  })
}

/** HTML 表格 → [表格] 标记文本（行换行、列制表符） */
function htmlTableToMarkedText(tableHtml) {
  const rows = []
  const trMatches = tableHtml.match(/<tr[\s\S]*?<\/tr>/gi) || []
  for (const tr of trMatches) {
    const cells = []
    const cellMatches = tr.match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi) || []
    for (const cell of cellMatches) {
      const inner = cell
        .replace(/<t[dh][^>]*>/i, '')
        .replace(/<\/t[dh]>/i, '')
        .replace(/<br\s*\/?>/gi, ' ')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .trim()
      cells.push(inner)
    }
    if (cells.some(Boolean)) rows.push(cells.join('\t'))
  }
  if (!rows.length) return '\n[表格]\n[/表格]\n'
  return `\n[表格]\n${rows.join('\n')}\n[/表格]\n`
}

/** mammoth HTML 输出转纯文本，保留表格结构 */
function htmlToPlainWithTables(html) {
  let s = String(html || '')
  s = s.replace(/<table[\s\S]*?<\/table>/gi, (tableHtml) => htmlTableToMarkedText(tableHtml))
  s = s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return s
}

/** PDF 文本后处理：识别多列行并转为 [表格] 标记（列用制表符） */
function enhancePdfTableText(text) {
  const lines = String(text || '').split('\n')
  const out = []
  let tableBuffer = []

  function flushTable() {
    if (tableBuffer.length >= 2) {
      out.push('[表格]')
      for (const line of tableBuffer) {
        const cols = line.trim().split(/\s{2,}/).map((c) => c.trim()).filter(Boolean)
        out.push(cols.length >= 2 ? cols.join('\t') : line.trim())
      }
      out.push('[/表格]')
    } else {
      out.push(...tableBuffer)
    }
    tableBuffer = []
  }

  for (const line of lines) {
    const trimmed = line.trim()
    const cols = trimmed.split(/\s{2,}/).filter((c) => c.length > 0)
    if (cols.length >= 2 && trimmed.length > 0) {
      tableBuffer.push(line)
    } else {
      flushTable()
      out.push(line)
    }
  }
  flushTable()
  return out.join('\n').trim()
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

/**
 * 解析 DOCX 中的 rels 文件，建立 rId → 文件路径 映射
 */
function parseDocxRels(zip) {
  const relsMap = {}
  const relsEntry = zip.getEntry('word/_rels/document.xml.rels')
  if (!relsEntry) return relsMap

  try {
    const relsXml = relsEntry.getData().toString('utf8')
    const relRe = /<Relationship[^>]*Id="([^"]*)"[^>]*Target="([^"]*)"[^>]*\/>/g
    let m
    while ((m = relRe.exec(relsXml)) !== null) {
      const target = m[2]
      // 处理相对路径：media/image1.wmf → word/media/image1.wmf
      const fullPath = target.startsWith('media/') ? 'word/' + target : target
      relsMap[m[1]] = fullPath
    }
  } catch (e) {
    console.warn('[docxRels] 解析 rels 失败', e.message)
  }
  return relsMap
}

/**
 * 从 ZIP 中读取文件为 base64
 */
function readZipFileBase64(zip, entryPath) {
  const entry = zip.getEntry(entryPath)
  if (!entry) return null
  const buf = entry.getData()
  if (!buf || buf.length === 0) return null
  return buf.toString('base64')
}

/**
 * DOCX 预处理：在 mammoth 之前，将 MathType OLE 公式和图片替换为占位符
 * 同时提取公式和图片的 base64 数据，用于后续自动渲染
 *
 * @param {Buffer} buffer docx 文件二进制
 * @returns {{ buffer: Buffer, formulaImages: Array, images: Array }}
 */
function preprocessDocxXml(buffer) {
  const formulaImages = []
  const images = []

  try {
    const zip = new AdmZip(buffer)
    const docEntry = zip.getEntry('word/document.xml')
    if (!docEntry) {
      console.warn('[docxPreprocess] 未找到 word/document.xml，跳过预处理')
      return { buffer, formulaImages, images }
    }

    // 解析 rId → 文件映射
    const relsMap = parseDocxRels(zip)

    let xml = docEntry.getData().toString('utf8')
    // 保留表格结构（convertTableToText: false 的等效实现）
    xml = preserveTablesInDocxXml(xml)
    let modifications = 0
    let formulaIdx = 0
    let imageIdx = 0

    // ========== 辅助函数：提取 OLE 公式对应的 WMF 渲染图 ==========
    function extractOleImage(oleXmlBlock, idx) {
      // 从 OLE 对象的 r:id 找到对应的 WMF 文件
      const rIdMatch = oleXmlBlock.match(/r:id="(rId\d+)"/)
      if (rIdMatch && relsMap[rIdMatch[1]]) {
        const wmfPath = relsMap[rIdMatch[1]]
        const b64 = readZipFileBase64(zip, wmfPath)
        if (b64) {
          const ext = wmfPath.split('.').pop().toLowerCase()
          // 判断尺寸（从 XML 中提取 cy/style 属性估算）
          let width = 'auto', height = 'auto'
          const styleMatch = oleXmlBlock.match(/style="width:([\d.]+)(pt|in|cm|px)/)
          if (styleMatch) {
            width = styleMatch[1]
            const unit = styleMatch[2]
            if (unit === 'pt') width = Math.round(parseFloat(width) * 1.33) + 'px'
            else if (unit === 'in') width = Math.round(parseFloat(width) * 96) + 'px'
          }
          formulaImages.push({
            index: idx,
            base64: b64,
            format: ext,
            width,
            height,
          })
          return true
        }
      }
      // 如果 r:id 没找到，尝试从 w:pict 的 imagedata 找
      const imgIdMatch = oleXmlBlock.match(/r:id="(rId\d+)"/g)
      if (imgIdMatch) {
        for (const idStr of imgIdMatch) {
          const id = idStr.match(/rId\d+/)[0]
          if (relsMap[id]) {
            const b64 = readZipFileBase64(zip, relsMap[id])
            if (b64) {
              formulaImages.push({ index: idx, base64: b64, format: relsMap[id].split('.').pop().toLowerCase(), width: 'auto', height: 'auto' })
              return true
            }
          }
        }
      }
      return false
    }

    // ========== 辅助函数：提取独立图片 ==========
    function extractDrawingImage(drawingXml, idx) {
      // 从 a:blip 的 r:embed 找到图片
      const blipMatch = drawingXml.match(/r:embed="(rId\d+)"/)
      if (blipMatch && relsMap[blipMatch[1]]) {
        const imgPath = relsMap[blipMatch[1]]
        const b64 = readZipFileBase64(zip, imgPath)
        if (b64) {
          const ext = imgPath.split('.').pop().toLowerCase()
          images.push({
            index: idx,
            base64: b64,
            mime: ext === 'png' ? 'image/png' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'gif' ? 'image/gif' : 'image/' + ext,
            size: b64.length,
          })
          return true
        }
      }
      return false
    }

    // 1. 处理 MathType OLE 公式对象
    const oleRe = /<w:object[\s\S]*?<\/w:object>/g
    xml = xml.replace(oleRe, (match) => {
      if (match.includes('OLEObject')) {
        modifications++
        extractOleImage(match, formulaIdx++)
        return '<w:r><w:t xml:space="preserve">【公式】</w:t></w:r>'
      }
      return match
    })

    // 2. 处理 w:pict 中的 OLE 公式 / 图片
    const pictRe = /<w:pict[\s\S]*?<\/w:pict>/g
    xml = xml.replace(pictRe, (match) => {
      if (match.includes('OLEObject') || match.includes('EMBED Equation')) {
        modifications++
        extractOleImage(match, formulaIdx++)
        return '<w:r><w:t xml:space="preserve">【公式】</w:t></w:r>'
      }
      if (match.includes('imagedata') || match.includes('image')) {
        modifications++
        // 提取图片
        const rIdMatch = match.match(/r:id="(rId\d+)"/)
        if (rIdMatch && relsMap[rIdMatch[1]]) {
          const b64 = readZipFileBase64(zip, relsMap[rIdMatch[1]])
          if (b64) {
            const p = relsMap[rIdMatch[1]]
            images.push({ index: imageIdx, base64: b64, mime: p.endsWith('.png') ? 'image/png' : p.endsWith('.jpg') ? 'image/jpeg' : 'image/' + p.split('.').pop(), size: b64.length })
          }
        }
        imageIdx++
        return '<w:r><w:t xml:space="preserve">[图片占位符]</w:t></w:r>'
      }
      return match
    })

    // 3. 处理 w:drawing（图片）
    const drawingRe = /<w:drawing[\s\S]*?<\/w:drawing>/g
    xml = xml.replace(drawingRe, (match) => {
      modifications++
      extractDrawingImage(match, imageIdx++)
      return '<w:r><w:t xml:space="preserve">[图片占位符]</w:t></w:r>'
    })

    // 4. 处理独立的 OLEObject
    const standaloneOleRe = /<o:OLEObject[^>]*\/>/g
    xml = xml.replace(standaloneOleRe, () => {
      modifications++
      formulaIdx++
      return '<w:r><w:t xml:space="preserve">【公式】</w:t></w:r>'
    })

    if (modifications > 0) {
      zip.updateFile('word/document.xml', Buffer.from(xml, 'utf8'))
      console.log('[docxPreprocess] 预处理完成', {
        modifications,
        formulasExtracted: formulaImages.length,
        imagesExtracted: images.length,
        oleFormulas: (xml.match(/【公式】/g) || []).length,
        imagePlaceholders: (xml.match(/\[图片占位符\]/g) || []).length,
      })
      return { buffer: zip.toBuffer(), formulaImages, images }
    }

    console.log('[docxPreprocess] 无需预处理（未发现公式或图片）')
    return { buffer, formulaImages, images }
  } catch (err) {
    console.error('[docxPreprocess] 预处理失败，回退原始文件', {
      error: err instanceof Error ? err.message : String(err),
    })
    return { buffer, formulaImages, images }
  }
}

/** 解析 .docx */
async function parseDocx(buffer, fileName) {
  console.log('[试卷解析] 开始 Word', { fileName, bytes: buffer.length })

  const { buffer: preprocessed, formulaImages: preFormulas, images: preImages } = preprocessDocxXml(buffer)
  const extracted = extractImagesFromDocx(buffer)
  const formulaImages = preFormulas.length > 0 ? preFormulas : extracted.formulaImages
  const images = preImages.length > 0 ? preImages : extracted.images

  let text = ''
  try {
    const htmlResult = await mammoth.convertToHtml(
      { buffer: preprocessed },
      MAMMOTH_TABLE_OPTIONS,
    )
    text = htmlToPlainWithTables(htmlResult.value)
    if (htmlResult.messages?.length) {
      console.log('[试卷解析] mammoth convertToHtml 提示', {
        count: htmlResult.messages.length,
        sample: htmlResult.messages.slice(0, 3).map((m) => m.message),
      })
    }
  } catch (htmlErr) {
    console.warn('[试卷解析] convertToHtml 失败，回退 extractRawText', {
      error: htmlErr instanceof Error ? htmlErr.message : String(htmlErr),
    })
  }

  if (!text) {
    const result = await mammoth.extractRawText({ buffer: preprocessed }, MAMMOTH_TABLE_OPTIONS)
    text = (result.value || '').trim()
  }

  if (!text) {
    throw new Error('Word 试卷未能提取到文字，请检查文件内容')
  }

  const formulaCount = (text.match(/【公式】/g) || []).length
  const imageCount = (text.match(/\[图片占位符\]/g) || []).length
  const tableCount = (text.match(/\[表格\]/g) || []).length

  console.log('[试卷解析] Word 完成', {
    fileName,
    textLength: text.length,
    formulaMarkers: formulaCount,
    imagePlaceholders: imageCount,
    tableMarkers: tableCount,
    formulasExtracted: formulaImages.length,
    imagesExtracted: images.length,
  })

  const result2 = { text, type: 'docx', _preprocessStats: { formulaMarkers: formulaCount, imagePlaceholders: imageCount } }

  // 附加提取的公式/图片数据
  if (formulaImages.length > 0) {
    result2.formulaImages = formulaImages
  }
  if (images.length > 0) {
    result2.images = images
  }

  return result2
}

/**
 * 调用 MinerU API 对扫描版 PDF 进行 OCR
 * MinerU API 端点：POST /file_parse（同步）
 * 参数：files（multipart array）、parse_method="ocr"、lang_list=["ch"]、formula_enable=true
 * 返回：{ "0": { "markdown": "...", "status": "done" } }
 */
async function parsePdfWithMinerU(buffer, fileName) {
  const mineruUrl = process.env.MINERU_API_URL
  if (!mineruUrl) {
    throw new Error('MINERU_API_URL 未配置，无法处理扫描版 PDF')
  }
  // 去除末尾斜杠
  const baseUrl = mineruUrl.replace(/\/$/, '')

  console.log('[MinerU] 开始调用 MinerU API 解析扫描 PDF', {
    fileName,
    bytes: buffer.length,
    baseUrl: baseUrl.slice(0, 60),
  })

  try {
    // 手动拼 multipart/form-data（Vercel Serverless 中 globalThis.FormData 可能不支持 binary Blob）
    const boundary = `----MinerUBoundary${Date.now()}`
    const CRLF = '\r\n'
    const safeFileName = (fileName || 'exam.pdf').replace(/[^\w.-]/g, '_')

    // files 字段（PDF 文件）
    const fileHeader = [
      `--${boundary}`,
      `Content-Disposition: form-data; name="files"; filename="${safeFileName}"`,
      'Content-Type: application/pdf',
      '',
      '',
    ].join(CRLF)

    // 附加文本字段的工具函数
    function textField(name, value) {
      return `--${boundary}${CRLF}Content-Disposition: form-data; name="${name}"${CRLF}${CRLF}${value}${CRLF}`
    }

    const footer = `--${boundary}--${CRLF}`

    const parts = [
      Buffer.from(fileHeader, 'utf8'),
      buffer,
      Buffer.from(CRLF, 'utf8'),
      Buffer.from(textField('parse_method', 'ocr'), 'utf8'),
      Buffer.from(textField('lang_list', 'ch'), 'utf8'),
      Buffer.from(textField('formula_enable', 'true'), 'utf8'),
      Buffer.from(textField('table_enable', 'true'), 'utf8'),
      Buffer.from(textField('return_md', 'true'), 'utf8'),
      Buffer.from(textField('return_images', 'false'), 'utf8'),
      Buffer.from(textField('response_format_zip', 'false'), 'utf8'),
      Buffer.from(footer, 'utf8'),
    ]

    const body = Buffer.concat(parts)

    const response = await fetch(`${baseUrl}/file_parse`, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': String(body.length),
      },
      body,
      signal: AbortSignal.timeout(120000), // 扫描版 PDF OCR 最多等 2 分钟
    })

    if (!response.ok) {
      const errText = await response.text().catch(() => '')
      throw new Error(`MinerU API 返回错误：${response.status} ${errText.slice(0, 300)}`)
    }

    const result = await response.json()
    console.log('[MinerU] API 响应 keys', Object.keys(result || {}))

    // MinerU /file_parse 返回格式：
    // { "0": { "markdown": "...", "status": "done", ... }, "1": { ... } }
    // 或 { "markdown": "...", "status": "done" }（单文件时可能直接返回）
    let markdown = ''
    if (result && typeof result === 'object') {
      // 优先取 result["0"].markdown（新版格式）
      const firstItem = result['0'] || result[0] || result
      markdown =
        firstItem?.markdown ||
        firstItem?.md ||
        result?.markdown ||
        result?.content ||
        result?.text ||
        ''
    }

    if (!markdown || markdown.trim().length < 10) {
      const resultStr = JSON.stringify(result).slice(0, 300)
      throw new Error(`MinerU OCR 返回内容为空，响应：${resultStr}`)
    }

    console.log('[MinerU] OCR 成功', { charCount: markdown.length })
    return {
      text: markdown.trim(),
      type: 'pdf_mineru_ocr',
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[MinerU] 调用失败', { error: msg })
    throw new Error(`MinerU OCR 失败：${msg}`)
  }
}

/** 解析 .pdf（含扫描版 PDF 检测 + MinerU OCR 回退） */
async function parsePdf(buffer, fileName) {
  console.log('[试卷解析] 开始 PDF', { fileName, bytes: buffer.length })
  const pdfParse = getPdfParse()
  const data = await pdfParse(buffer)
  let text = enhancePdfTableText((data.text || '').trim())
  const pdfImages = await extractImagesFromPdf(buffer)
  console.log('[试卷解析] PDF 完成', {
    fileName,
    textLength: text.length,
    pages: data.numpages,
    tableMarkers: (text.match(/\[表格\]/g) || []).length,
    pdfImages: pdfImages.length,
  })

  // 文字层内容过少 → 判定为扫描版 PDF → 调用 MinerU OCR
  if (!text || text.length < 100) {
    console.warn('[examParser] PDF 文字层内容过少，判定为扫描版 PDF，尝试 MinerU OCR')
    const mineruUrl = process.env.MINERU_API_URL
    if (!mineruUrl) {
      throw new Error(
        '检测到扫描版 PDF（无文字层），且 MinerU OCR 服务未配置。请将 PDF 导出为图片后上传，或联系管理员开启 OCR 服务。',
      )
    }
    return await parsePdfWithMinerU(buffer, fileName)
  }

  return { text, type: 'pdf', ...(pdfImages.length ? { images: pdfImages } : {}) }
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
