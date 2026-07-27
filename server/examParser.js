import './applyUrlShim.js'
import mammoth from 'mammoth'
import AdmZip from 'adm-zip'
import { getSupabaseAdmin } from './supabaseAdmin.js'
import { logStepError } from './apiErrorUtil.js'

const MAX_EXAM_FILE_BYTES = 8 * 1024 * 1024

/** 懒加载 pdf-parse，绕过 index.js 在 Serverless 下误触发测试代码的问题 */
let pdfParseFn = null
function getPdfParse() {
  if (!pdfParseFn) {
    const { createRequire } = require('node:module')
    const req = createRequire(import.meta.url)
    pdfParseFn = req('pdf-parse/lib/pdf-parse.js')
  }
  if (typeof pdfParseFn !== 'function') {
    throw new Error('pdf-parse 模块加载异常，请检查依赖安装')
  }
  return pdfParseFn
}

/**
 * 从 DOCX ZIP 中提取嵌入的图片，上传到 Supabase Storage，
 * 返回 { [imagePath]: publicUrl } 映射。
 */
async function extractAndUploadImages(zipBuffer) {
  const imageMap = {}
  try {
    const zip = new AdmZip(zipBuffer)
    const entries = zip.getEntries()
    const imageEntries = entries.filter((e) => {
      const name = (e.entryName || '').toLowerCase()
      return name.startsWith('word/media/') && !e.isDirectory &&
        /\.(png|jpg|jpeg|gif|bmp|tiff|webp|svg|emf)$/i.test(name)
    })

    if (imageEntries.length === 0) return imageMap
    console.log('[试卷解析] 发现嵌入图片', { count: imageEntries.length })

    const admin = getSupabaseAdmin()
    const bucketName = 'exam-images'

    // 确保 bucket 存在
    const { data: buckets } = await admin.storage.listBuckets()
    if (!buckets?.find((b) => b.name === bucketName)) {
      await admin.storage.createBucket(bucketName, { public: true })
      console.log('[试卷解析] 创建 storage bucket:', bucketName)
    }

    for (const entry of imageEntries) {
      try {
        const fileName = entry.entryName.replace(/^word\/media\//, '')
        const ext = (fileName.split('.').pop() || 'png').toLowerCase()
        const mimeMap = {
          png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
          gif: 'image/gif', bmp: 'image/bmp', tiff: 'image/tiff',
          webp: 'image/webp', svg: 'image/svg+xml',
        }
        const contentType = mimeMap[ext] || 'image/png'

        // 跳过 WMF/EMF（浏览器不支持）
        if (ext === 'emf' || ext === 'wmf') continue

        const imageData = entry.getData()
        const timestamp = Date.now()
        const random = Math.random().toString(36).slice(2, 8)
        const uploadPath = `${timestamp}_${random}_${fileName}`

        const { data: uploadData, error: uploadError } = await admin.storage
          .from(bucketName)
          .upload(uploadPath, imageData, {
            contentType,
            upsert: true,
          })

        if (uploadError) {
          console.warn('[试卷解析] 图片上传失败', { fileName, error: uploadError.message })
          continue
        }

        const { data: urlData } = admin.storage
          .from(bucketName)
          .getPublicUrl(uploadPath)

        if (urlData?.publicUrl) {
          imageMap[entry.entryName] = urlData.publicUrl
        }
      } catch (imgErr) {
        console.warn('[试卷解析] 图片处理异常', {
          entry: entry.entryName,
          error: imgErr instanceof Error ? imgErr.message : String(imgErr),
        })
      }
    }

    console.log('[试卷解析] 图片上传完成', { uploaded: Object.keys(imageMap).length })
  } catch (err) {
    console.warn('[试卷解析] 图片提取整体失败（不影响文本解析）', {
      error: err instanceof Error ? err.message : String(err),
    })
  }
  return imageMap
}

/**
 * 预处理 DOCX XML：
 * 1. 将 OMML 公式 (m:oMath/m:oMathPara) 替换为 【公式】占位符
 * 2. 将图片 (w:drawing) 替换为 【图片】占位符（保留 rId 供后续映射）
 */
function preprocessDocxXml(docXml) {
  // 1. 替换 OMML 公式
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

  // 2. 替换图片为占位符（保留 rId 用于后续替换）
  let replacedImg = 0
  docXml = docXml.replace(/<wp:inline[\s\S]*?<\/wp:inline>/g, (match) => {
    const rIdMatch = match.match(/r:embed="([^"]+)"/)
    const rId = rIdMatch ? rIdMatch[1] : ''
    replacedImg++
    return `<w:r><w:rPr/><w:t xml:space="preserve">【图片:${rId}】</w:t></w:r>`
  })
  docXml = docXml.replace(/<wp:anchor[\s\S]*?<\/wp:anchor>/g, (match) => {
    const rIdMatch = match.match(/r:embed="([^"]+)"/)
    const rId = rIdMatch ? rIdMatch[1] : ''
    replacedImg++
    return `<w:r><w:rPr/><w:t xml:space="preserve">【图片:${rId}】</w:t></w:r>`
  })

  console.log('[试卷解析] XML 预处理完成', { replacedMath, replacedPara, replacedImg })
  return docXml
}

/**
 * 从 DOCX 解析获得 HTML（保留表格、图片占位符、公式占位符）
 * 然后：
 * 1. 提取嵌入图片并上传至 Supabase Storage
 * 2. 将图片占位符替换为实际 <img> 标签
 */
async function parseDocxToHtml(buffer, fileName) {
  console.log('[试卷解析] 开始 Word 解析（含表格+图片）', { fileName, bytes: buffer.length })

  try {
    // 1. 预处理 XML（公式→【公式】、图片→【图片:rId】）
    const zip = new AdmZip(buffer)
    let docXml = zip.readAsText('word/document.xml')
    docXml = preprocessDocxXml(docXml)

    // 2. 重新打包交给 mammoth（HTML 模式保留表格）
    const cleanZip = new AdmZip(buffer)
    cleanZip.updateFile('word/document.xml', Buffer.from(docXml, 'utf-8'))
    const cleanBuffer = cleanZip.toBuffer()

    // 3. 用 mammoth HTML 模式解析（保留表格结构）
    const result = await mammoth.convertToHtml(
      { buffer: cleanBuffer },
      {
        // 自定义样式映射：保留表格
        styleMap: [
          "p[style-name='Question'] => p.question",
          "p[style-name='Answer'] => p.answer",
          "p[style-name='Analysis'] => p.analysis",
        ],
      },
    )

    let html = (result.value || '').trim()
    if (!html || html === '<p></p>') {
      // HTML 模式无内容时降级为纯文本
      const textResult = await mammoth.extractRawText({ buffer: cleanBuffer })
      const text = (textResult.value || '').trim()
      if (!text) throw new Error('Word 试卷未能提取到文字')
      console.log('[试卷解析] HTML 模式无内容，降级为纯文本', { textLength: text.length })
      return { text, type: 'docx', images: {} }
    }

    // 4. 提取并上传 DOCX 中的嵌入图片
    const imageMap = await extractAndUploadImages(buffer)

    // 5. 将图片占位符替换为实际 <img> 标签
    //    先处理有 rId 的占位符
    const rels = extractImageRels(buffer)
    html = html.replace(/【图片:([^】]*)】/g, (match, rId) => {
      if (!rId) return '【图片】'
      // 通过 rId 查找关系文件中的图片路径
      const imagePath = rels[rId]
      if (imagePath && imageMap[imagePath]) {
        return `<img src="${imageMap[imagePath]}" alt="题目图片" style="max-width:100%;height:auto;" />`
      }
      // 尝试直接匹配
      for (const [key, url] of Object.entries(imageMap)) {
        if (key.includes(rId) || rId.includes(key.split('/').pop()?.split('.')[0] || '')) {
          return `<img src="${url}" alt="题目图片" style="max-width:100%;height:auto;" />`
        }
      }
      return '【图片】'
    })

    // 6. 处理无 rId 的普通【图片】占位符
    const remainingImages = Object.entries(imageMap).filter(([key]) => {
      return !html.includes(imageMap[key])
    })
    let imgIndex = 0
    html = html.replace(/【图片】/g, () => {
      if (imgIndex < remainingImages.length) {
        const url = remainingImages[imgIndex][1]
        imgIndex++
        return `<img src="${url}" alt="题目图片" style="max-width:100%;height:auto;" />`
      }
      return '【图片】'
    })

    // 7. 提取纯文本（给 chunker 用）+ 也保留 HTML 版本在 meta 中
    const textResult = await mammoth.extractRawText({ buffer: cleanBuffer })
    const text = (textResult.value || '').trim()

    // 清理 HTML 中的 mammoth 包装标签但保留核心结构
    html = cleanHtml(html)

    console.log('[试卷解析] Word 完成（HTML模式）', {
      fileName,
      textLength: text.length,
      htmlLength: html.length,
      imagesUploaded: Object.keys(imageMap).length,
    })

    return { text, html, type: 'docx', images: imageMap }
  } catch (err) {
    console.warn('[试卷解析] HTML 模式失败，降级为纯文本', {
      fileName,
      error: err instanceof Error ? err.message : String(err),
    })
    // 降级：普通 mammoth 纯文本
    const zip = new AdmZip(buffer)
    let docXml = zip.readAsText('word/document.xml')
    docXml = preprocessDocxXml(docXml)
    const cleanZip = new AdmZip(buffer)
    cleanZip.updateFile('word/document.xml', Buffer.from(docXml, 'utf-8'))
    const result = await mammoth.extractRawText({ buffer: cleanZip.toBuffer() })
    const text = (result.value || '').trim()
    if (!text) throw new Error('Word 试卷未能提取到文字')
    return { text, type: 'docx', images: {} }
  }
}

/**
 * 从 DOCX ZIP 中提取图片关系映射 (rId → image path)
 */
function extractImageRels(zipBuffer) {
  const rels = {}
  try {
    const zip = new AdmZip(zipBuffer)
    const relsEntry = zip.getEntry('word/_rels/document.xml.rels')
    if (!relsEntry) return rels

    const relsXml = relsEntry.getData().toString('utf-8')
    const relationshipRegex = /<Relationship[^>]*Id="([^"]*)"[^>]*Target="([^"]*)"[^>]*\/>/g
    let match
    while ((match = relationshipRegex.exec(relsXml)) !== null) {
      const rId = match[1]
      let target = match[2]
      // 将相对路径转换为 word/media/xxx
      if (target.startsWith('media/')) {
        target = 'word/' + target
      }
      rels[rId] = target
    }
  } catch {
    // 忽略关系解析错误
  }
  return rels
}

/** 清理 mammoth 生成的 HTML，保留表格和结构 */
function cleanHtml(html) {
  return html
    // 去掉 mammoth 的包装层
    .replace(/<html[^>]*>/g, '')
    .replace(/<\/html>/g, '')
    .replace(/<head>[\s\S]*?<\/head>/g, '')
    .replace(/<body[^>]*>/g, '')
    .replace(/<\/body>/g, '')
    .replace(/<meta[^>]*>/g, '')
    // 保留表格结构
    .replace(/<table>/g, '<table border="1" style="border-collapse:collapse;">')
    // 清理多余空白
    .replace(/\n\s*\n/g, '\n')
    .trim()
}

/** 对旧接口的兼容包装：返回 { text, type } */
async function parseDocxWithOMML(buffer, fileName) {
  const result = await parseDocxToHtml(buffer, fileName)
  return { text: result.text, type: 'docx', _html: result.html, _images: result.images }
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

let enhancedParseExamFile = undefined

/** 优先使用 teacher-api 增强解析（公式图提取、[图片占位符] 等） */
async function tryEnhancedParseExamFile(buffer, fileName, meta) {
  if (enhancedParseExamFile === false) return null
  if (enhancedParseExamFile) {
    return enhancedParseExamFile(buffer, fileName, meta)
  }
  try {
    const mod = await import('../teacher-api/server/examParser.js')
    enhancedParseExamFile = mod.parseExamFile
    return enhancedParseExamFile(buffer, fileName, meta)
  } catch (err) {
    console.warn('[试卷解析] 增强解析不可用，使用本地解析', {
      error: err instanceof Error ? err.message : String(err),
    })
    enhancedParseExamFile = false
    return null
  }
}

/**
 * 解析标准试卷：Word(.docx) 或 PDF
 * 对于 DOCX：返回 { text, html?, type, images?, formulaImages? }
 * 对于 PDF：返回 { text, type }
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
    const enhanced = await tryEnhancedParseExamFile(buffer, fileName, meta)
    if (enhanced) return enhanced

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
