/**
 * 拆题完成后二次修复：文本 OCR 精修 + 公式图视觉识别
 */
import { callDeepSeekVisionAI } from '../deepseekClient.js'
import { cleanFormula, extractLatexBlocks, normalizeQuestion } from './questionNormalizer.js'
import { replaceUnsupportedFormulaImages, contentNeedsSanitize } from './questionContentSanitizer.js'
import { repairQuestionFields } from './questionOcrRepair.js'
import { IMAGE_PLACEHOLDER } from './batchQualityPrompts.js'

const FORMULA_TOKEN_RE = /(【公式】|【公式待补】)/
const REPAIR_SIGNAL_RE = /【公式】|【公式待补】|\[图片占位符\]|【图片】|含公式占位符|含图片占位符/

const CONCURRENCY = Number(process.env.DECOMPOSE_REPAIR_CONCURRENCY) || 2
const VISION_ENABLED = !/^(0|false|no)$/i.test(String(process.env.DECOMPOSE_VISION_REPAIR ?? '1'))

export function isPostRepairEnabled() {
  return !/^(0|false|no)$/i.test(String(process.env.DECOMPOSE_POST_REPAIR ?? '1'))
}

export function questionNeedsPostRepair(q) {
  if (!q || typeof q !== 'object') return false
  const blob = [q.content, q.answer, q.analysis, ...(Array.isArray(q.tags) ? q.tags : [])].join('\n')
  return REPAIR_SIGNAL_RE.test(blob)
}

async function recognizeFormulaImage(formulaImage) {
  const b64 = formulaImage?.png_base64 || formulaImage?.base64
  if (!b64) return null

  const fmt = formulaImage.format || 'png'
  const mime = formulaImage.mime || (fmt === 'wmf' ? 'image/wmf' : `image/${fmt}`)

  const system = '你是数学公式识别专家。根据图片输出标准 LaTeX 表达式，不要加 $ 或 $$ 分隔符，不要任何解释文字。'
  const user = '识别图中的数学公式，只输出 LaTeX。'

  try {
    const raw = await callDeepSeekVisionAI(system, user, b64, mime)
    const latex = cleanFormula(String(raw ?? '')).replace(/^\$\$?|\$\$?$/g, '').trim()
    return latex || null
  } catch (err) {
    console.warn('[questionPostRepair] 公式视觉识别失败', {
      message: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}

async function visionReplaceFormulaPlaceholders(text, formulaImages, startIndex = 0) {
  if (!text || !/(【公式】|【公式待补】)/.test(text)) {
    return { text, nextIndex: startIndex, replaced: 0 }
  }

  let idx = startIndex
  let replaced = 0
  const tokens = text.split(FORMULA_TOKEN_RE)
  const out = []

  for (const token of tokens) {
    if (token === '【公式】' || token === '【公式待补】') {
      if (idx < (formulaImages?.length || 0) && VISION_ENABLED) {
        const latex = await recognizeFormulaImage(formulaImages[idx])
        idx++
        if (latex) {
          out.push(latex.includes('$') ? latex : `$${latex}$`)
          replaced++
          continue
        }
      }
      out.push(token)
    } else {
      out.push(token)
    }
  }

  return { text: out.join(''), nextIndex: idx, replaced }
}

async function repairSingleQuestion(q, index, meta) {
  const taskMeta = {
    subject: meta.subject,
    grade: meta.grade,
    formulaImages: meta.formulaImages || [],
    images: meta.images || [],
    _formulaIdx: meta._formulaIdx ?? 0,
    _imageIdx: meta._imageIdx ?? 0,
  }

  let working = { ...q }

  if (questionNeedsPostRepair(working)) {
    const repaired = await repairQuestionFields(
      { content: working.content, answer: working.answer, analysis: working.analysis },
      meta,
    )
    if (repaired.repaired) {
      working = {
        ...working,
        content: repaired.content,
        answer: repaired.answer,
        analysis: repaired.analysis,
      }
    }
  }

  const fields = ['content', 'answer', 'analysis']
  for (const field of fields) {
    const result = await visionReplaceFormulaPlaceholders(
      working[field],
      taskMeta.formulaImages,
      taskMeta._formulaIdx,
    )
    working[field] = result.text
    taskMeta._formulaIdx = result.nextIndex
  }

  for (const field of ['content', 'answer', 'analysis']) {
    if (contentNeedsSanitize(working[field])) {
      const { text } = await replaceUnsupportedFormulaImages(working[field])
      working[field] = text
    }
  }

  const renormalized = normalizeQuestion(working, index, taskMeta)
  if (!renormalized) return q

  meta._formulaIdx = taskMeta._formulaIdx
  meta._imageIdx = taskMeta._imageIdx

  const latex_blocks = [
    ...new Set([
      ...(Array.isArray(renormalized.latex_blocks) ? renormalized.latex_blocks : []),
      ...extractLatexBlocks(renormalized.content),
      ...extractLatexBlocks(renormalized.answer),
      ...extractLatexBlocks(renormalized.analysis),
    ]),
  ]

  const tags = (renormalized.tags || []).filter(
    (t) => t !== '含公式占位符' && t !== '含图片占位符',
  )
  const stillHasFormula = /【公式】|【公式待补】/.test(
    [renormalized.content, renormalized.answer, renormalized.analysis].join('\n'),
  )
  const stillHasImage = renormalized.content?.includes(IMAGE_PLACEHOLDER)
    || /\[图片占位符\]/.test(renormalized.content || '')

  if (stillHasFormula) tags.push('含公式占位符')
  if (stillHasImage) tags.push('含图片占位符')

  return {
    ...renormalized,
    source: q.source || renormalized.source || '试卷导入',
    latex_blocks,
    tags,
  }
}

async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length)
  let cursor = 0

  async function worker() {
    while (cursor < items.length) {
      const i = cursor++
      results[i] = await fn(items[i], i)
    }
  }

  const workers = Math.min(Math.max(1, limit), items.length)
  await Promise.all(Array.from({ length: workers }, () => worker()))
  return results
}

/**
 * 拆题完成后对仍含占位符的题目做二次修复
 * @param {object[]} questions
 * @param {object} meta subject, grade, formulaImages, images
 */
export async function repairQuestionsAfterDecompose(questions, meta = {}) {
  if (!isPostRepairEnabled()) {
    console.log('[questionPostRepair] 已禁用（DECOMPOSE_POST_REPAIR=0）')
    return questions
  }

  const list = Array.isArray(questions) ? questions : []
  if (!list.length) return list

  const needRepair = list.filter(questionNeedsPostRepair)
  if (!needRepair.length) {
    console.log('[questionPostRepair] 无需二次修复', { total: list.length })
    return list
  }

  console.log('[questionPostRepair] 开始二次修复', {
    total: list.length,
    needRepair: needRepair.length,
    formulaImages: (meta.formulaImages || []).length,
    images: (meta.images || []).length,
    visionEnabled: VISION_ENABLED,
  })

  const sharedMeta = {
    subject: meta.subject,
    grade: meta.grade,
    formulaImages: meta.formulaImages || [],
    images: meta.images || [],
    _formulaIdx: 0,
    _imageIdx: 0,
  }

  const repairedMap = new Map()
  const repairedList = await mapWithConcurrency(needRepair, CONCURRENCY, async (q) => {
    const idx = list.indexOf(q)
    const fixed = await repairSingleQuestion(q, idx, { ...sharedMeta })
    repairedMap.set(q, fixed)
    return fixed
  })

  void repairedList

  const result = list.map((q) => repairedMap.get(q) || q)
  const remaining = result.filter(questionNeedsPostRepair).length

  console.log('[questionPostRepair] 二次修复完成', {
    repaired: needRepair.length,
    remainingPlaceholders: remaining,
  })

  return result
}
