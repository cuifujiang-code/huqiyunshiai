/**
 * DOCX 教辅书导入：复用试卷解析引擎提取正文 + 公式图 + 插图
 */
import { parseExamFile } from '../../teacher-api/server/examParser.js'
import { buildImageTag } from '../batch/imageExtractor.js'
import { callDeepSeekAI, getDeepSeekConfig } from '../deepseekClient.js'
import { enrichFormulaImagesWithPng, isWmfOrEmf } from './wmfConvert.js'
import {
  cleanBookChapters,
  filterWatermarkFromText,
  mergeCleanStats,
  buildCleanSummaryMessage,
  countLatexFormulas,
} from './bookDocxClean.js'
import { bookPreprocessDocxBuffer } from './bookDocxPreprocess.js'

export { cleanBookChapters, buildCleanSummaryMessage, WATERMARK_KEYWORDS } from './bookDocxClean.js'

const AI_CHUNK = 6000

function cleanWordFalseArtifacts(text) {
  return String(text || '')
    .replace(/([\w\u4e00-\u9fff(（【])false([\w\u4e00-\u9fff)）】])/g, '$1$2')
    .replace(/falsefalse+/gi, '【公式】')
    .replace(/【公式块】/g, '【公式】')
}

const EMBEDDED_FIGURE_TOKEN = '【嵌入图形】'
const EMBEDDED_IMG_RE = /<img\b[\s\S]*?\bsrc=["'](data:image\/[^"']+)["'][\s\S]*?\/?>/gi

function normalizeFigureTag(src, { formula = false } = {}) {
  const cls = formula
    ? 'book-formula-img book-figure max-w-full h-auto inline-block align-middle'
    : 'book-figure max-w-full h-auto my-2'
  const alt = formula ? '公式' : '图形'
  return `<img src="${src}" alt="${alt}" class="${cls}" style="display:inline-block;vertical-align:middle;max-height:2em;max-width:100%;" />`
}

/** 将内嵌 base64 图片提取为 figures 数组，正文替换为短占位符（避免分块截断 HTML） */
function extractEmbeddedFigures(content) {
  const figures = []
  EMBEDDED_IMG_RE.lastIndex = 0
  const text = String(content || '').replace(EMBEDDED_IMG_RE, (full, src) => {
    const isFormula = /book-formula-img|alt="公式"/.test(full)
    figures.push(normalizeFigureTag(src, { formula: isFormula }))
    return `\n${EMBEDDED_FIGURE_TOKEN}\n`
  })
  return { text, figures }
}

function applyFigureExtractionToChapters(chapters) {
  return chapters.map((ch) => ({
    ...ch,
    sections: (ch.sections || []).map((sec) => ({
      ...sec,
      blocks: (sec.blocks || []).map((block) => {
        if (!block.content?.includes('<img')) return block
        const { text, figures } = extractEmbeddedFigures(block.content)
        return { ...block, content: text, figures: [...(block.figures || []), ...figures] }
      }),
    })),
  }))
}

/** 按占位符边界安全分块，保持 figures 与【嵌入图形】顺序一致 */
function splitTextWithFigures(text, figures, maxChunks = 4) {
  if (!text.includes(EMBEDDED_FIGURE_TOKEN)) {
    return [{ text, figures: figures || [] }]
  }
  const parts = text.split(EMBEDDED_FIGURE_TOKEN)
  const chunks = []
  let currentText = ''
  let currentFigures = []
  let figIdx = 0

  for (let i = 0; i < parts.length; i++) {
    currentText += parts[i]
    if (i < parts.length - 1) {
      currentText += EMBEDDED_FIGURE_TOKEN
      if (figures[figIdx]) currentFigures.push(figures[figIdx])
      figIdx += 1
    }
    if (currentText.length >= 12000 && chunks.length < maxChunks - 1) {
      chunks.push({ text: currentText, figures: currentFigures })
      currentText = ''
      currentFigures = []
    }
  }
  if (currentText.trim()) chunks.push({ text: currentText, figures: currentFigures })
  return chunks.length ? chunks : [{ text, figures: figures || [] }]
}

function buildBookFormulaTag(fi) {
  const b64 = fi?.png_base64 || fi?.base64
  if (!b64) return '【公式】'
  const fmt = String(fi.format || 'png').toLowerCase()
  if (!fi.png_base64 && isWmfOrEmf(fmt, fi.mime)) return '【公式】'
  const mime = fi.mime || (fmt === 'png' ? 'image/png' : `image/${fmt}`)
  return normalizeFigureTag(`data:${mime};base64,${b64}`, { formula: true })
}

function replaceFormulaPlaceholders(text, formulaImages = []) {
  if (!text?.includes('【公式')) return text
  let idx = 0
  return text.replace(/【公式】|【公式块】/g, () => {
    if (idx >= formulaImages.length) return '【公式】'
    const tag = buildBookFormulaTag(formulaImages[idx])
    idx += 1
    return tag
  })
}

function replaceImagePlaceholders(text, images = []) {
  if (!text) return text
  let idx = 0
  return text
    .replace(/\[图片占位符\]/g, () => {
      if (idx >= images.length) return '【图片】'
      const tag = buildImageTag(images[idx++], { inline: false, kind: 'image' })
      return tag === '[图片占位符]' ? '【图片】' : tag
    })
    .replace(/【图片】/g, () => {
      if (idx >= images.length) return '【图片】'
      const tag = buildImageTag(images[idx++], { inline: false, kind: 'image' })
      return tag === '[图片占位符]' ? '【图片】' : tag
    })
}

async function repairRemainingFormulasWithAi(text) {
  if (!getDeepSeekConfig().hasApiKey || !/【公式】/.test(text)) return text

  const parts = text.split(/(【公式】)/)
  let out = ''
  let buffer = ''

  const flush = async () => {
    if (!buffer.includes('【公式】')) {
      out += buffer
      buffer = ''
      return
    }
    const chunk = buffer.slice(0, AI_CHUNK)
    buffer = buffer.slice(AI_CHUNK)
    try {
      const system = `你是数学教辅排版助手。将文本中的「【公式】」按上下文替换为 KaTeX LaTeX（行内 $...$，独立 $$...$$）。
只返回替换后的文本，不要解释。禁止输出「公式待补」。`
      const repaired = await callDeepSeekAI(system, chunk, {
        label: 'DocxImport-Formula',
        maxTokens: 4000,
        temperature: 0.2,
        timeoutMs: 90000,
      })
      if (repaired?.trim()) out += repaired.trim()
      else out += chunk
    } catch {
      out += chunk
    }
  }

  for (const part of parts) {
    buffer += part
    if (buffer.length >= AI_CHUNK) await flush()
  }
  if (buffer) await flush()
  return out || text
}

function newBlockId() {
  return `block_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function parseTextToChapters(text) {
  const lines = text.split('\n')
  const chapters = []
  let currentChapter = null
  let currentSection = null
  let paragraphBuffer = []

  const ensureChapter = (title = '导入内容') => {
    if (!currentChapter) {
      currentChapter = { id: `ch_${Date.now()}_${chapters.length}`, title, sections: [] }
    }
  }

  const ensureSection = (title = '正文') => {
    ensureChapter()
    if (!currentSection) {
      currentSection = { id: `sec_${Date.now()}_${currentChapter.sections.length}`, title, blocks: [] }
      currentChapter.sections.push(currentSection)
    }
  }

  const pushBlock = (block) => {
    ensureSection()
    currentSection.blocks.push(block)
  }

  const flushParagraph = (type = 'knowledge', title = '知识讲解') => {
    const content = paragraphBuffer.join('\n').trim()
    paragraphBuffer = []
    if (!content) return
    pushBlock({ id: newBlockId(), type, title, content })
  }

  const isChapterTitle = (t) => /^第[一二三四五六七八九十\d]+章/.test(t) || /^#{1,3}\s/.test(t)
  const isSectionTitle = (t) =>
    (/^[一二三四五六七八九十]+[、．.]/.test(t) || /^\([一二三四五六七八九十]+\)/.test(t)) && t.length <= 48
  const isExample = (t) => /^例\s*\d|^练\s*\d|^【.*】/.test(t)
  const isAnswer = (t) => /^\[?(解答|答案|解析)\]?/.test(t)

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) {
      flushParagraph()
      continue
    }

    if (isChapterTitle(trimmed)) {
      flushParagraph()
      if (currentChapter) chapters.push(currentChapter)
      currentChapter = {
        id: `ch_${Date.now()}_${chapters.length}`,
        title: trimmed.replace(/^#+\s*/, ''),
        sections: [],
      }
      currentSection = null
      continue
    }

    if (isSectionTitle(trimmed)) {
      flushParagraph()
      ensureChapter()
      currentSection = {
        id: `sec_${Date.now()}_${currentChapter.sections.length}`,
        title: trimmed,
        blocks: [],
      }
      currentChapter.sections.push(currentSection)
      continue
    }

    if (isExample(trimmed)) {
      flushParagraph()
      pushBlock({
        id: newBlockId(),
        type: /^练/.test(trimmed) ? 'exercise' : 'example',
        title: trimmed.slice(0, 40),
        content: trimmed,
      })
      continue
    }

    if (isAnswer(trimmed)) {
      flushParagraph('summary', '解答')
      paragraphBuffer.push(trimmed)
      flushParagraph('summary', '解答')
      continue
    }

    paragraphBuffer.push(trimmed)
  }

  flushParagraph()

  if (currentChapter) chapters.push(currentChapter)
  if (!chapters.length && text.trim()) {
    chapters.push({
      id: `ch_${Date.now()}`,
      title: '导入内容',
      sections: [
        {
          id: `sec_${Date.now()}`,
          title: '正文',
          blocks: [{ id: newBlockId(), type: 'knowledge', title: '知识讲解', content: text.trim() }],
        },
      ],
    })
  }

  return compactChapters(chapters)
}

function compactChapters(chapters, maxBlocks = 40) {
  const normalized = applyFigureExtractionToChapters(chapters)
  const allBlocks = normalized.flatMap((ch) => ch.sections.flatMap((s) => s.blocks))
  if (allBlocks.length <= maxBlocks) return normalized

  const examples = allBlocks.filter((b) => b.type === 'example' || b.type === 'exercise')
  let mergedText = ''
  let mergedFigures = []

  for (const b of allBlocks.filter((x) => x.type !== 'example' && x.type !== 'exercise')) {
    mergedText += (mergedText ? '\n\n' : '') + (b.content || '')
    mergedFigures.push(...(b.figures || []))
  }

  const mainChapter = normalized[0] || { title: '导入内容' }
  const textChunks = splitTextWithFigures(mergedText, mergedFigures, 6)
  const blocks = textChunks.map((chunk, i) => ({
    id: newBlockId(),
    type: 'knowledge',
    title: i === 0 ? mainChapter.title || '导入正文' : `正文（续 ${i + 1}）`,
    content: chunk.text,
    figures: chunk.figures,
  }))
  blocks.push(...examples.slice(0, Math.max(0, maxBlocks - blocks.length)))

  return [
    {
      id: mainChapter.id || `ch_${Date.now()}`,
      title: mainChapter.title || '导入内容',
      sections: [
        {
          id: `sec_${Date.now()}`,
          title: '正文',
          blocks: blocks.length ? blocks : allBlocks.slice(0, maxBlocks),
        },
      ],
    },
  ]
}

function countFormulas(text) {
  const latex = (text.match(/\$[^$\n]+\$|\$\$[\s\S]*?\$\$/g) || []).length
  const tokens = (text.match(/【嵌入图形】/g) || []).length
  const pending = (text.match(/【公式】/g) || []).length
  return latex + tokens + pending
}

function countChapterFormulas(chapters) {
  let n = 0
  for (const ch of chapters) {
    for (const sec of ch.sections || []) {
      for (const b of sec.blocks || []) {
        n += countFormulas(b.content || '')
        n += (b.figures || []).length
      }
    }
  }
  return n
}

export async function importDocxBuffer(buffer, fileName = 'import.docx') {
  if (!buffer?.length) throw new Error('DOCX 文件为空')

  const lower = String(fileName || '').toLowerCase()
  if (lower.endsWith('.doc') && !lower.endsWith('.docx')) {
    throw new Error('暂不支持旧版 .doc 格式，请用 Word 另存为 .docx 后导入')
  }

  const { buffer: preprocessed, stats: preprocessStats } = await bookPreprocessDocxBuffer(buffer)

  const parsed = await parseExamFile(preprocessed, fileName)
  let text = String(parsed.text || '').trim()
  if (!text) throw new Error('未能从 Word 文档提取到文字内容')

  const formulaImages = enrichFormulaImagesWithPng(parsed.formulaImages || [])
  text = cleanWordFalseArtifacts(text)
  text = replaceFormulaPlaceholders(text, formulaImages)
  text = replaceImagePlaceholders(text, parsed.images || [])

  const textClean = filterWatermarkFromText(text)
  text = textClean.text

  const remainingFormulas = (text.match(/【公式】/g) || []).length
  if (remainingFormulas > 0 && remainingFormulas <= 80) {
    text = await repairRemainingFormulasWithAi(text)
  }

  text = text.replace(/【公式待补】/g, '【公式】')

  let chapters = parseTextToChapters(text)
  const { chapters: cleanedChapters, stats: chapterStats } = cleanBookChapters(chapters)
  chapters = cleanedChapters

  const cleanStats = mergeCleanStats(preprocessStats, {
    ...chapterStats,
    watermarksRemoved: (preprocessStats.watermarksRemoved || 0) + (textClean.watermarksRemoved || 0) + (chapterStats.watermarksRemoved || 0),
    formulasConverted: countLatexFormulas(text) + (preprocessStats.ommlConverted || 0),
    ommlConverted: preprocessStats.ommlConverted || 0,
  })

  const imageCount = (parsed.images || []).length + (parsed.formulaImages || []).length

  return {
    chapters,
    imageCount,
    formulaCount: countChapterFormulas(chapters),
    rawText: text.slice(0, 5000),
    formulaImagesExtracted: formulaImages.length,
    formulaImagesConvertedToPng: formulaImages.filter((f) => f.png_base64).length,
    cleanStats,
    cleanSummary: buildCleanSummaryMessage(cleanStats),
  }
}
