/**
 * DOCX 导入前置 XML 清洗：浮动水印图层、文本框广告、OMML 公式转 LaTeX
 */
import AdmZip from 'adm-zip'
import { WATERMARK_KEYWORDS } from './bookDocxClean.js'

let ommlModulePromise = null
function loadOmmlModule() {
  if (!ommlModulePromise) {
    ommlModulePromise = import('./ommlToLatex.js').catch((err) => {
      console.warn('[bookDocxPreprocess] OMML 模块不可用，跳过公式转 LaTeX:', err?.message || err)
      return null
    })
  }
  return ommlModulePromise
}

const WM_RE = new RegExp(
  WATERMARK_KEYWORDS.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'),
  'i',
)

function paragraphPlainText(pXml) {
  return [...pXml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
    .map((m) =>
      m[1]
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&'),
    )
    .join('')
    .trim()
}

function isWatermarkParagraph(pXml) {
  const text = paragraphPlainText(pXml)
  if (!text) return false
  if (WM_RE.test(text)) return true
  const yellow =
    /<w:highlight[^>]*w:val=["'](?:yellow|lightYellow|yellowGreen)["']/i.test(pXml) &&
    WM_RE.test(text)
  if (yellow) return true
  if (text.length < 120 && /(学科网|ZXXK|资源站|下载地址)/i.test(text)) return true
  return false
}

function isFloatingWatermarkBlock(blockXml) {
  const text = paragraphPlainText(blockXml)
  if (!text || !WM_RE.test(text)) return false
  return (
    /<w:txbxContent/i.test(blockXml) ||
    /<v:textbox/i.test(blockXml) ||
    /<wp:anchor/i.test(blockXml) ||
    /<w:drawing/i.test(blockXml)
  )
}

/** 从 document.xml 剔除水印段落与浮动文本框 */
export function stripWatermarkFromDocXml(xml) {
  let removed = 0
  let out = xml

  out = out.replace(/<w:p[\s\S]*?<\/w:p>/g, (pXml) => {
    if (isWatermarkParagraph(pXml) || isFloatingWatermarkBlock(pXml)) {
      removed += 1
      return ''
    }
    return pXml
  })

  out = out.replace(/<w:txbxContent[\s\S]*?<\/w:txbxContent>/gi, (block) => {
    if (WM_RE.test(paragraphPlainText(block))) {
      removed += 1
      return ''
    }
    return block
  })

  return { xml: out, watermarksRemoved: removed }
}

const DOCX_PARTS = [
  'word/document.xml',
  ...Array.from({ length: 6 }, (_, i) => `word/header${i + 1}.xml`),
  ...Array.from({ length: 6 }, (_, i) => `word/footer${i + 1}.xml`),
]

/**
 * 教辅书 DOCX 前置清洗（写入 mammoth 之前）
 * @returns {{ buffer: Buffer, stats: { watermarksRemoved: number, ommlConverted: number } }}
 */
export async function bookPreprocessDocxBuffer(buffer) {
  const stats = { watermarksRemoved: 0, ommlConverted: 0 }
  if (!buffer?.length) return { buffer, stats }

  const ommlMod = await loadOmmlModule()

  try {
    const zip = new AdmZip(buffer)
    let modified = false

    for (const part of DOCX_PARTS) {
      const entry = zip.getEntry(part)
      if (!entry) continue
      let xml = entry.getData().toString('utf8')
      const before = xml

      const wm = stripWatermarkFromDocXml(xml)
      xml = wm.xml
      stats.watermarksRemoved += wm.watermarksRemoved

      if (part === 'word/document.xml' && ommlMod?.replaceOmmlWithLatexInDocXml) {
        const omml = ommlMod.replaceOmmlWithLatexInDocXml(xml)
        xml = omml.xml
        stats.ommlConverted += omml.ommlConverted
      }

      if (xml !== before) {
        zip.updateFile(part, Buffer.from(xml, 'utf8'))
        modified = true
      }
    }

    if (modified) {
      return { buffer: zip.toBuffer(), stats }
    }
    return { buffer, stats }
  } catch (err) {
    console.warn('[bookDocxPreprocess] 预处理失败，使用原文件', {
      error: err instanceof Error ? err.message : String(err),
    })
    return { buffer, stats }
  }
}
