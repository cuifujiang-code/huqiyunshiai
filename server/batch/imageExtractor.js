/**
 * 批量拆题 · 试卷图片提取与 Supabase Storage 持久化
 */

import AdmZip from 'adm-zip'
import {
  ensureBatchImagesBucket,
  isSupabaseStorageConfigured,
  uploadBatchImage,
} from '../supabaseAdmin.js'

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
      const fullPath = target.startsWith('media/') ? `word/${target}` : target
      relsMap[m[1]] = fullPath
    }
  } catch (e) {
    console.warn('[imageExtractor] 解析 rels 失败', e instanceof Error ? e.message : String(e))
  }
  return relsMap
}

function readZipFileBase64(zip, entryPath) {
  const entry = zip.getEntry(entryPath)
  if (!entry) return null
  const buf = entry.getData()
  if (!buf || buf.length === 0) return null
  return buf.toString('base64')
}

function mimeFromPath(filePath) {
  const ext = filePath.split('.').pop()?.toLowerCase() || 'png'
  const map = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    bmp: 'image/bmp',
    wmf: 'image/x-wmf',
    emf: 'image/x-emf',
    svg: 'image/svg+xml',
  }
  return map[ext] || `image/${ext}`
}

/**
 * 从 DOCX 二进制中提取嵌入图片（含公式渲染图）
 * @returns {{ formulaImages: object[], images: object[] }}
 */
export function extractImagesFromDocx(buffer) {
  const formulaImages = []
  const images = []
  if (!buffer?.length) return { formulaImages, images }

  try {
    const zip = new AdmZip(buffer)
    const docEntry = zip.getEntry('word/document.xml')
    if (!docEntry) return { formulaImages, images }

    const relsMap = parseDocxRels(zip)
    const xml = docEntry.getData().toString('utf8')
    let formulaIdx = 0
    let imageIdx = 0

    function pushFormulaImage(b64, filePath, width = 'auto', height = 'auto') {
      if (!b64) return
      const ext = filePath.split('.').pop()?.toLowerCase() || 'png'
      formulaImages.push({ index: formulaIdx++, base64: b64, format: ext, width, height, mime: mimeFromPath(filePath) })
    }

    function pushDrawingImage(b64, filePath) {
      if (!b64) return
      images.push({
        index: imageIdx++,
        base64: b64,
        mime: mimeFromPath(filePath),
        size: b64.length,
        alt: `试卷插图${imageIdx}`,
      })
    }

    for (const match of xml.matchAll(/<w:object[\s\S]*?<\/w:object>/g)) {
      if (!match[0].includes('OLEObject')) continue
      const rIdMatch = match[0].match(/r:id="(rId\d+)"/)
      if (rIdMatch && relsMap[rIdMatch[1]]) {
        pushFormulaImage(readZipFileBase64(zip, relsMap[rIdMatch[1]]), relsMap[rIdMatch[1]])
      }
    }

    for (const match of xml.matchAll(/<w:pict[\s\S]*?<\/w:pict>/g)) {
      const block = match[0]
      if (block.includes('OLEObject') || block.includes('EMBED Equation')) {
        const rIdMatch = block.match(/r:id="(rId\d+)"/)
        if (rIdMatch && relsMap[rIdMatch[1]]) {
          pushFormulaImage(readZipFileBase64(zip, relsMap[rIdMatch[1]]), relsMap[rIdMatch[1]])
        }
        continue
      }
      if (block.includes('imagedata') || block.includes('image')) {
        const rIdMatch = block.match(/r:id="(rId\d+)"/)
        if (rIdMatch && relsMap[rIdMatch[1]]) {
          pushDrawingImage(readZipFileBase64(zip, relsMap[rIdMatch[1]]), relsMap[rIdMatch[1]])
        }
      }
    }

    for (const match of xml.matchAll(/<w:drawing[\s\S]*?<\/w:drawing>/g)) {
      const blipMatch = match[0].match(/r:embed="(rId\d+)"/)
      if (blipMatch && relsMap[blipMatch[1]]) {
        pushDrawingImage(readZipFileBase64(zip, relsMap[blipMatch[1]]), relsMap[blipMatch[1]])
      }
    }

    console.log('[imageExtractor] DOCX 图片提取完成', {
      formulaCount: formulaImages.length,
      imageCount: images.length,
    })
  } catch (err) {
    console.error('[imageExtractor] DOCX 图片提取失败', {
      error: err instanceof Error ? err.message : String(err),
    })
  }

  return { formulaImages, images }
}

/**
 * PDF 内嵌图片提取（pdf-parse 不支持，预留 pdfjs-dist 扩展）
 */
export async function extractImagesFromPdf(_buffer) {
  try {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs').catch(() => null)
    if (!pdfjs) {
      console.log('[imageExtractor] pdfjs-dist 未安装，跳过 PDF 内嵌图片提取')
      return []
    }
    console.log('[imageExtractor] pdfjs-dist 已加载，PDF 内嵌图片提取尚未完整实现')
    return []
  } catch (err) {
    console.warn('[imageExtractor] PDF 图片提取跳过', err instanceof Error ? err.message : String(err))
    return []
  }
}

async function uploadOneImage(batchId, item, index, kind) {
  const b64 = item.png_base64 || item.base64
  if (!b64) return item
  const mime = item.mime || mimeFromPath(`${kind}.${item.format || 'png'}`)
  const url = await uploadBatchImage(batchId, index, Buffer.from(b64, 'base64'), mime, kind)
  return {
    ...item,
    url,
    alt: item.alt || (kind === 'formula' ? '公式' : '插图'),
  }
}

/**
 * 将提取的图片上传到 Supabase Storage，返回带公开 URL 的数组
 */
export async function persistExamImages(batchId, { formulaImages = [], images = [] } = {}) {
  if (!batchId || !isSupabaseStorageConfigured()) {
    console.log('[imageExtractor] Storage 未配置，保留 base64 内联', { batchId })
    return { formulaImages, images }
  }

  try {
    await ensureBatchImagesBucket()
  } catch (err) {
    console.warn('[imageExtractor] Storage bucket 初始化失败，保留 base64', {
      batchId,
      error: err instanceof Error ? err.message : String(err),
    })
    return { formulaImages, images }
  }

  const uploadedFormulas = []
  for (let i = 0; i < formulaImages.length; i++) {
    try {
      uploadedFormulas.push(await uploadOneImage(batchId, formulaImages[i], i, 'formula'))
    } catch (err) {
      console.warn('[imageExtractor] 公式图上传失败，保留 base64', {
        batchId, index: i, error: err instanceof Error ? err.message : String(err),
      })
      uploadedFormulas.push(formulaImages[i])
    }
  }

  const uploadedImages = []
  for (let i = 0; i < images.length; i++) {
    try {
      uploadedImages.push(await uploadOneImage(batchId, images[i], i, 'image'))
    } catch (err) {
      console.warn('[imageExtractor] 插图上传失败，保留 base64', {
        batchId, index: i, error: err instanceof Error ? err.message : String(err),
      })
      uploadedImages.push(images[i])
    }
  }

  console.log('[imageExtractor] 图片已上传 Storage', {
    batchId,
    formulaCount: uploadedFormulas.filter((x) => x.url).length,
    imageCount: uploadedImages.filter((x) => x.url).length,
  })

  return { formulaImages: uploadedFormulas, images: uploadedImages }
}

/** 构建带 src/alt 的 img 标签（优先 Storage URL） */
export function buildImageTag(img, { inline = false, kind = 'image' } = {}) {
  const alt = img.alt || (kind === 'formula' ? '公式' : '插图')
  const style = inline
    ? 'display:inline-block;vertical-align:middle;max-width:100%;height:auto;'
    : 'display:block;max-width:100%;height:auto;margin:8px 0;'

  if (img.url) {
    return `<img src="${img.url}" alt="${alt}" style="${style}" />`
  }

  const b64 = img.png_base64 || img.base64
  if (!b64) return kind === 'formula' ? '【公式待补】' : '[图片占位符]'

  const fmt = String(img.format || '').toLowerCase()
  const mime = img.mime || mimeFromPath(`x.${img.format || 'png'}`)
  // 浏览器无法显示 WMF/EMF，公式类保留占位符供二次视觉修复转 LaTeX
  if (kind === 'formula' && (fmt === 'wmf' || fmt === 'emf' || /wmf|emf/i.test(mime))) {
    return '【公式】'
  }
  const w = img.width || 'auto'
  const h = img.height || 'auto'
  return `<img src="data:${mime};base64,${b64}" alt="${alt}" style="${style}" width="${w}" height="${h}" />`
}
