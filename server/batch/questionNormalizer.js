/**
 * 批量拆题 · 题目标准化引擎
 * 将 AI 任意格式输出强制转换为可入库的标准结构
 */

import { IMAGE_PLACEHOLDER, FORMULA_PLACEHOLDER } from './batchQualityPrompts.js'
import { enrichQuestionOptions, extractOptionsFromContent, isIncompleteQuestion } from './questionCompleteness.js'
import { buildImageTag } from './imageExtractor.js'

/** K12 全学科 26 种标准题型（入库与标准化统一使用） */
export const VALID_QUESTION_TYPES = new Set([
  '选择题', '填空题', '计算题', '证明题', '实验题', '应用题', '解答题',
  '作图题', '识图题', '推断题',
  '阅读理解', '文言文阅读', '古诗词鉴赏', '语言运用', '默写', '作文',
  '完形填空', '七选五', '语法填空', '短文改错', '书面表达', '听力',
  '材料分析题', '论述题', '综合题', '读图题',
])
const VALID_TYPES = VALID_QUESTION_TYPES
const VALID_DIFFICULTY = new Set(['基础', '中等', '拔高'])
const EMPTY_OPTION_RE = /^[A-Fa-f][\.．、\)）]?\s*$/

/** 统一全角/半角、空格、换行、标点 */
export function cleanText(text) {
  if (text == null) return ''
  let s = String(text)
    .replace(/\uFEFF/g, '')
    .replace(/\x0c/g, '')
    .replace(/\u0000/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')

  const fullToHalf = {
    '（': '(', '）': ')', '「': '"', '」': '"',
    '『': '"', '』': '"', '，': ',', '。': '.', '；': ';', '：': ':',
    '？': '?', '！': '!', '％': '%', '＋': '+', '－': '-', '＝': '=',
    '　': ' ',
  }
  for (const [full, half] of Object.entries(fullToHalf)) {
    s = s.split(full).join(half)
  }

  s = s
    .replace(/[\t\f\v]+/g, ' ')
    .replace(/[ \u3000]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\.{4,}/g, '…')
    .trim()

  return s
}

/** 清洗公式乱码，统一 LaTeX 为 $$...$$ */
export function cleanFormula(text) {
  if (text == null) return ''
  let s = String(text)
    .replace(/\x0c/g, '')
    .replace(/\\\\/g, '\\')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, ' ')
    .replace(/\\\$/g, '$')
    .replace(/\$\s*\$/g, '$$')
    .trim()

  // \( \) \ [ \] → $$
  s = s.replace(/\\\(([\s\S]*?)\\\)/g, (_, inner) => `$$${inner.trim()}$$`)
  s = s.replace(/\\\[([\s\S]*?)\\\]/g, (_, inner) => `$$${inner.trim()}$$`)

  // 行内 $...$ 保留；独立行公式统一为 $$
  s = s.replace(/\$\$([\s\S]*?)\$\$/g, (_, inner) => {
    const body = inner.replace(/\\\\/g, '\\').trim()
    return body ? `$$${body}$$` : ''
  })

  // 修复残缺：单个 $ 配对
  const dollarCount = (s.match(/(?<!\$)\$(?!\$)/g) || []).length
  if (dollarCount % 2 === 1) s += '$'

  // 合并连续 $$
  s = s.replace(/\$\$\s*\$\$/g, '$$')

  return s
}

/** 从文本中提取所有 $$...$$ 公式片段（不含分隔符） */
export function extractLatexBlocks(text) {
  const cleaned = cleanFormula(text)
  const blocks = []
  const re = /\$\$([\s\S]*?)\$\$/g
  let m
  while ((m = re.exec(cleaned)) !== null) {
    const block = m[1].replace(/\\\\/g, '\\').trim()
    if (block && !blocks.includes(block)) blocks.push(block)
  }
  return blocks
}

export function normalizeQuestionType(raw) {
  const t = cleanText(raw?.question_type ?? raw?.type ?? '')
  if (VALID_TYPES.has(t)) return t
  const lower = t.toLowerCase()
  if (/选择|单选|多选|choice/.test(lower)) return '选择题'
  if (/填空|blank/.test(lower)) return '填空题'
  if (/计算|calc/.test(lower)) return '计算题'
  if (/证明|proof/.test(lower)) return '证明题'
  if (/实验|experiment/.test(lower)) return '实验题'
  if (/解答|简答|问答|综合/.test(lower)) return '解答题'
  if (/作图|画图|绘图/.test(lower)) return '作图题'
  if (/识图|看图/.test(lower)) return '识图题'
  if (/推断|推测/.test(lower)) return '推断题'
  if (/阅读|read/.test(lower)) return '阅读理解'
  if (/文言/.test(lower)) return '文言文阅读'
  if (/诗词|古诗|鉴赏/.test(lower)) return '古诗词鉴赏'
  if (/语言运用|语用/.test(lower)) return '语言运用'
  if (/默写|背诵/.test(lower)) return '默写'
  if (/作文|写作|书面表达/.test(lower)) return '作文'
  if (/完形|cloze/.test(lower)) return '完形填空'
  if (/七选五|7选5/.test(lower)) return '七选五'
  if (/语法填空|语法/.test(lower)) return '语法填空'
  if (/短文改错|改错/.test(lower)) return '短文改错'
  if (/听力|listen/.test(lower)) return '听力'
  if (/材料分析|材料/.test(lower)) return '材料分析题'
  if (/论述|essay/.test(lower)) return '论述题'
  if (/读图/.test(lower)) return '读图题'
  return '解答题'
}

function normalizeDifficulty(raw) {
  const d = cleanText(raw?.difficulty ?? '')
  if (VALID_DIFFICULTY.has(d)) return d
  if (/基础|简单|easy/.test(d)) return '基础'
  if (/拔高|困难|hard/.test(d)) return '拔高'
  return '中等'
}

function normalizeOptions(raw, questionType, content = '') {
  const src = raw?.options ?? raw?.choices ?? raw?.option_list ?? []
  let options = []
  if (Array.isArray(src)) {
    options = src.map((o) => cleanText(typeof o === 'object' ? o?.text ?? o?.label ?? o?.content : o)).filter(Boolean)
  } else if (typeof src === 'object' && src) {
    options = Object.values(src).map((o) => cleanText(String(o))).filter(Boolean)
  }

  // 移除空占位选项
  options = options.filter((o) => o.length > 2 && !EMPTY_OPTION_RE.test(o))

  const isChoice = questionType === '选择题' || options.length >= 2 || /[A-Fa-f][\.．、\)）]\s*\S/.test(content)

  if (isChoice && options.length < 2) {
    const extracted = extractOptionsFromContent(content)
    if (extracted.length >= 2) {
      options = extracted
    }
  }

  return options
}

/** 题目是否有效（content 非空且非残次占位） */
export function isValidQuestion(q) {
  if (!q || typeof q !== 'object') return false
  const content = cleanText(q.content ?? '')
  if (!content || content.length < 8) return false
  if (/^(null|undefined|N\/A|暂无)$/i.test(content)) return false
  if (isIncompleteQuestion(q)) return false
  return true
}

/**
 * 用预提取的公式渲染图替换 content 中的【公式】占位符
 * 支持两种格式：
 *   新格式（后端自动提取）: {base64, format:'wmf'|'png', width, height}
 *   旧格式（Python提取）:   {png_base64, width, height}
 * @param {string} text 文本内容
 * @param {Array} formulaImages 预提取的公式图
 * @param {number} startIndex 公式图索引起始偏移
 * @returns {{ text: string, replacedCount: number, nextIndex: number }}
 */
function replaceFormulaPlaceholders(text, formulaImages, startIndex = 0) {
  if (!formulaImages || !formulaImages.length) return { text, replacedCount: 0, nextIndex: startIndex }
  if (!text || !text.includes('【公式】')) return { text, replacedCount: 0, nextIndex: startIndex }

  // 安全限制：最多替换 50 个公式，防止 content 过大
  const MAX_FORMULA_PER_QUESTION = 50
  let replaced = 0
  let idx = startIndex

  text = text.replace(/【公式】/g, () => {
    if (idx >= formulaImages.length) return '【公式待补】'
    if (replaced >= MAX_FORMULA_PER_QUESTION) return '【公式】'
    const fi = formulaImages[idx]
    idx++

    // 获取 base64（兼容新旧格式）
    const b64 = fi.png_base64 || fi.base64
    if (!b64) return '【公式待补】'

    replaced++

    // 限制 base64 长度
    const MAX_B64_LEN = 15000
    let safeB64 = b64
    if (safeB64.length > MAX_B64_LEN) {
      console.warn('[normalizer] 公式 base64 过长，截断', { idx: idx - 1, len: safeB64.length })
      safeB64 = safeB64.slice(0, MAX_B64_LEN)
    }

    const w = fi.width || 'auto'
    const h = fi.height || 'auto'
    const fmt = fi.format || 'png'

    return buildImageTag(
      { ...fi, png_base64: safeB64, base64: safeB64, format: fmt, width: w, height: h },
      { inline: true, kind: 'formula' },
    )
  })

  return { text, replacedCount: replaced, nextIndex: idx }
}

/**
 * 用预提取的图片替换 content 中的 [图片占位符]
 * @param {string} text 文本内容
 * @param {Array} images 预提取的图片 [{base64, mime}]
 * @param {number} startIndex 图片索引起始偏移
 */
function replaceImagePlaceholders(text, images, startIndex = 0) {
  if (!images || !images.length) return { text, replacedCount: 0, nextIndex: startIndex }
  if (!text || !/(?:\[图片占位符\]|【图片】|【图片占位符】)/.test(text)) {
    return { text, replacedCount: 0, nextIndex: startIndex }
  }

  const MAX_IMG_PER_QUESTION = 20
  let replaced = 0
  let idx = startIndex

  const replaceOne = () => {
    if (idx >= images.length) return '[图片占位符]'
    if (replaced >= MAX_IMG_PER_QUESTION) return '[图片占位符]'
    const img = images[idx]
    idx++
    if (img && (img.url || img.base64)) {
      replaced++
      return buildImageTag(img, { inline: false, kind: 'image' })
    }
    return '[图片占位符]'
  }

  text = text.replace(/\[图片占位符\]|【图片】|【图片占位符】/g, replaceOne)

  return { text, replacedCount: replaced, nextIndex: idx }
}

/**
 * 将 AI 原始题目强制转换为标准结构
 * @param {object} raw AI 返回的单题对象
 * @param {number} index 题目序号（从 0 开始）
 * @param {object} [taskMeta] 批次学科/年级默认值 + formulaImages + images
 */
export function normalizeQuestion(raw, index, taskMeta = {}) {
  if (!raw || typeof raw !== 'object') return null

  const sortOrder = Number.isFinite(Number(raw.sort_order))
    ? Math.max(1, Number(raw.sort_order))
    : index + 1

  const questionType = normalizeQuestionType(raw)
  const difficulty = normalizeDifficulty(raw)

  let content = cleanText(raw.content ?? raw.question ?? raw.题干 ?? raw.title ?? raw.stem ?? '')
  let answer = cleanText(raw.answer ?? raw.correct_answer ?? raw.答案 ?? raw.key ?? '')
  let analysis = cleanText(raw.analysis ?? raw.explanation ?? raw.解析 ?? raw.solution ?? '')
  let geometryDesc = cleanText(raw.geometry_desc ?? raw.geometryDesc ?? raw.figure_desc ?? '')

  content = cleanFormula(content)
  answer = cleanFormula(answer)
  analysis = cleanFormula(analysis)

  if (!content) content = `题目 ${sortOrder}`
  if (!answer) answer = '暂无'
  if (!analysis) analysis = '暂无'

  // ── 用预提取的图片替换占位符 ──
  const formulaImages = taskMeta.formulaImages || taskMeta.formula_images || []
  const extractedImages = taskMeta.images || taskMeta.extracted_images || []
  let formulaIdx = taskMeta._formulaIdx || 0
  let imageIdx = taskMeta._imageIdx || 0

  if (formulaImages.length > 0) {
    const result = replaceFormulaPlaceholders(content, formulaImages, formulaIdx)
    content = result.text
    formulaIdx = result.nextIndex
    if (result.replacedCount > 0) {
      answer = replaceFormulaPlaceholders(answer, formulaImages, formulaIdx).text
      analysis = replaceFormulaPlaceholders(analysis, formulaImages, formulaIdx).text
    }
  }

  if (extractedImages.length > 0) {
    const imgResult = replaceImagePlaceholders(content, extractedImages, imageIdx)
    content = imgResult.text
    imageIdx = imgResult.nextIndex
  }

  const hasImagePlaceholder = content.includes(IMAGE_PLACEHOLDER)
    || /\[图片占位符\]/.test(content)
    || /\[图(?:片|形)占位\]/.test(content)

  const hasFormulaPlaceholder = content.includes(FORMULA_PLACEHOLDER)
    || /【公式】/.test(content)

  if (hasImagePlaceholder && !/此题包含图片/.test(analysis)) {
    analysis = analysis === '暂无'
      ? '此题包含图片，需手动处理'
      : `${analysis}\n此题包含图片，需手动处理`
  }

  const options = normalizeOptions(raw, questionType, content)

  const latexFromFields = [
    ...extractLatexBlocks(content),
    ...extractLatexBlocks(answer),
    ...extractLatexBlocks(analysis),
  ]
  const explicitLatex = Array.isArray(raw.latex_blocks)
    ? raw.latex_blocks
    : Array.isArray(raw.latexBlocks)
      ? raw.latexBlocks
      : []
  const latex_blocks = [
    ...new Set([
      ...explicitLatex.map((b) => cleanFormula(String(b)).replace(/^\$\$|\$\$$/g, '').trim()).filter(Boolean),
      ...latexFromFields,
    ]),
  ]

  const tagsRaw = raw.tags ?? []
  const tags = Array.isArray(tagsRaw)
    ? tagsRaw.map((t) => cleanText(t)).filter(Boolean)
    : []
  if (hasImagePlaceholder && !tags.includes('含图片占位符')) {
    tags.push('含图片占位符')
  }
  if (hasFormulaPlaceholder && !tags.includes('含公式占位符')) {
    tags.push('含公式占位符')
  }

  const normalized = {
    subject: cleanText(raw.subject ?? taskMeta.subject ?? '') || '数学',
    grade: cleanText(raw.grade ?? taskMeta.grade ?? '') || '八年级',
    knowledge_point: cleanText(raw.knowledge_point ?? raw.knowledgePoint ?? raw.kp ?? '') || '未分类',
    question_type: questionType,
    difficulty,
    content,
    options,
    answer,
    analysis,
    geometry_desc: geometryDesc,
    latex_blocks,
    question_number: cleanText(raw.question_number ?? raw.questionNumber ?? raw.number ?? '') || String(sortOrder),
    sort_order: sortOrder,
    source: cleanText(raw.source ?? '') || '批量拆题',
    tags,
    has_image_placeholder: hasImagePlaceholder,
  }

  return isValidQuestion(normalized) ? normalized : null
}

/**
 * 批量标准化并过滤无效题
 * @returns {{ valid: object[], rawCount: number, filteredCount: number }}
 */
export function normalizeQuestionsBatch(rawQuestions, taskMeta = {}, startIndex = 0) {
  const list = Array.isArray(rawQuestions) ? rawQuestions : []
  const rawCount = list.length
  const valid = []

  // 初始化图片索引追踪（跨题目共享）
  if (!taskMeta._formulaIdx) taskMeta._formulaIdx = 0
  if (!taskMeta._imageIdx) taskMeta._imageIdx = 0

  for (let i = 0; i < list.length; i++) {
    let normalized = normalizeQuestion(list[i], startIndex + i, taskMeta)
    if (normalized) {
      normalized = enrichQuestionOptions(normalized)
      if (isValidQuestion(normalized)) {
        valid.push(normalized)
      }
    }
  }

  const filteredCount = rawCount - valid.length
  console.log(`[标准化] 原始题目数=${rawCount}，有效题目数=${valid.length}，过滤掉=${filteredCount}`)

  return { valid, rawCount, filteredCount }
}
