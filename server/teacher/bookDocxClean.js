/**
 * 教辅书 Word 导入 — 水印过滤、排版标准化、章节清洗
 */

/** 水印/广告关键词黑名单（整段匹配删除） */
export const WATERMARK_KEYWORDS = [
  '学科网',
  'ZXXK',
  'zxxk',
  'zzk',
  '来自学科网',
  '菁优网',
  '学科资源网',
  '百度文库',
  '原创力文档',
  '教习网',
  '资源站',
  '下载地址',
  'www.zxxk.com',
  'ZXXK.COM',
]

const WATERMARK_RE = new RegExp(
  WATERMARK_KEYWORDS.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'),
  'i',
)

const PAGE_BREAK_RE = /\f|\x0c|<w:br[^>]*w:type=["']page["'][^>]*\/?>/gi
const COLUMN_BREAK_RE = /分栏|column-break|w:type=["']column["']/gi

function stripHtmlTags(s) {
  return String(s || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

/** 单行是否为水印/广告 */
export function isWatermarkLine(line) {
  const t = stripHtmlTags(line).trim()
  if (!t || t.length > 200) return false
  if (WATERMARK_RE.test(t)) return true
  if (/^[\s·\-—|]*学科网/i.test(t)) return true
  if (/^[\s·\-—|]*来自.*网/i.test(t) && t.length < 80) return true
  return false
}

/** 文本级水印过滤 + 段落合并 */
export function filterWatermarkFromText(text) {
  let watermarksRemoved = 0
  const lines = String(text || '').split('\n')
  const kept = []

  for (const line of lines) {
    if (isWatermarkLine(line)) {
      watermarksRemoved += 1
      continue
    }
    kept.push(line)
  }

  let merged = kept.join('\n')
  merged = merged.replace(
    /(学科网|ZXXK|zxxk|来自学科网|菁优网|学科资源网|百度文库|原创力文档|教习网|资源站|下载地址)[^\n]{0,60}/gi,
    () => {
      watermarksRemoved += 1
      return ''
    },
  )

  return { text: normalizeParagraphText(merged), watermarksRemoved }
}

/** 清除多余换行、分页符、空白 */
export function normalizeParagraphText(text) {
  let s = String(text || '')
  s = s.replace(PAGE_BREAK_RE, '\n\n')
  s = s.replace(/\r\n/g, '\n')
  s = s.replace(/[ \t]+\n/g, '\n')
  s = s.replace(/\n[ \t]+/g, '\n')
  s = s.replace(/\n{4,}/g, '\n\n\n')
  s = s.replace(/^\s+|\s+$/gm, (m, offset, str) => {
    const lineStart = str.lastIndexOf('\n', offset - 1) + 1
    const line = str.slice(lineStart, str.indexOf('\n', offset) === -1 ? undefined : str.indexOf('\n', offset))
    if (/^第[一二三四五六七八九十\d]+章/.test(line.trim())) return line.trim()
    return m.trim() ? m : ''
  })
  s = s.replace(/\n{3,}/g, '\n\n')
  return s.trim()
}

/** 统计 LaTeX 公式数量 */
export function countLatexFormulas(text) {
  const inline = (String(text).match(/\$(?!\$)[^$\n]+?\$/g) || []).length
  const block = (String(text).match(/\$\$[\s\S]*?\$\$/g) || []).length
  return inline + block
}

/** 统计图片公式（嵌入图形 / img 公式标签） */
export function countImageFormulas(text, figures = []) {
  const embedded = (String(text).match(/【嵌入图形】/g) || []).length
  const imgFormula = (String(text).match(/book-formula-img|alt="公式"/g) || []).length
  const pending = (String(text).match(/【公式】/g) || []).length
  return embedded + imgFormula + pending + (figures?.length || 0)
}

function normalizeBlockContent(content) {
  const { text, watermarksRemoved } = filterWatermarkFromText(content)
  return { content: text, watermarksRemoved }
}

/** 清洗章节 blocks，返回统计 */
export function cleanBookChapters(chapters = []) {
  const stats = {
    watermarksRemoved: 0,
    formulasConverted: 0,
    imageFormulasKept: 0,
    paragraphsNormalized: 0,
    blocksCleaned: 0,
  }

  const cleaned = chapters.map((ch) => ({
    ...ch,
    title: filterWatermarkFromText(ch.title || '').text || ch.title,
    sections: (ch.sections || []).map((sec) => ({
      ...sec,
      title: filterWatermarkFromText(sec.title || '').text || sec.title,
      blocks: (sec.blocks || []).map((block) => {
        const { content, watermarksRemoved } = normalizeBlockContent(block.content || '')
        stats.watermarksRemoved += watermarksRemoved
        stats.blocksCleaned += 1
        if (content !== block.content) stats.paragraphsNormalized += 1
        stats.formulasConverted += countLatexFormulas(content)
        stats.imageFormulasKept += countImageFormulas(content, block.figures)
        return { ...block, content }
      }),
    })),
  }))

  return { chapters: cleaned, stats }
}

export function mergeCleanStats(a = {}, b = {}) {
  return {
    watermarksRemoved: (a.watermarksRemoved || 0) + (b.watermarksRemoved || 0),
    formulasConverted: Math.max(a.formulasConverted || 0, b.formulasConverted || 0),
    ommlConverted: (a.ommlConverted || 0) + (b.ommlConverted || 0),
    imageFormulasKept: Math.max(a.imageFormulasKept || 0, b.imageFormulasKept || 0),
    paragraphsNormalized: (a.paragraphsNormalized || 0) + (b.paragraphsNormalized || 0),
    blocksCleaned: (a.blocksCleaned || 0) + (b.blocksCleaned || 0),
  }
}

export function buildCleanSummaryMessage(stats) {
  const w = stats.watermarksRemoved || 0
  const f = (stats.ommlConverted || 0) + (stats.formulasConverted || 0)
  const p = stats.paragraphsNormalized || 0
  let msg = `已自动过滤水印广告 ${w} 处，转换数学公式 ${f} 个，规整段落格式 ${p} 处`
  if ((stats.imageFormulasKept || 0) > 30) {
    msg += '。部分公式为图片格式，可手动重新录入 LaTeX 优化显示'
  }
  return msg
}
