/**
 * 校验 [附图] / <img> 是否与题目本身相关
 * 批量导入时常见整卷附图误挂到每道题末尾
 */
import { isFileLikeImageRef } from './questionImageIndex.js'

const IMG_TAG_RE = /<img\b[^>]*class="question-figure"[^>]*\/?>/gi
const IMG_ALT_RE = /alt="([^"]*)"/i

/** 从文件名提取卷名/题源 key */
export function extractExamKeyFromRef(refName = '') {
  return String(refName)
    .trim()
    .replace(/_p\d+_\d+.*$/i, '')
    .replace(/_图\d+.*$/i, '')
    .replace(/\.(wmf|emf|png|jpe?g|gif|bmp|webp)$/i, '')
    .trim()
}

function normalizeText(s = '') {
  return String(s)
    .replace(/\s+/g, '')
    .replace(/[（）()【】\[\]《》""''·,，。、；;：:\-—]/g, '')
    .toLowerCase()
}

/** 收集题干/题源中的匹配线索 */
export function extractHintsFromQuestion(row = {}) {
  const content = String(row.content || '')
  const source = String(row.source || '')
  const parts = [content.slice(0, 320)]

  const paren = content.match(/[（(]([^）)]{4,120})[）)]/)
  if (paren) parts.push(paren[1])

  if (source && source !== '批量导入') parts.push(source)

  return normalizeText(parts.join('|'))
}

/** 两串是否存在足够长的公共子串 */
export function hasSubstantialOverlap(a, b, minLen = 6) {
  const x = normalizeText(a)
  const y = normalizeText(b)
  if (!x || !y) return false
  if (x.includes(y) || y.includes(x)) return true

  const shorter = x.length <= y.length ? x : y
  const longer = x.length <= y.length ? y : x
  for (let len = Math.min(shorter.length, 24); len >= minLen; len--) {
    for (let i = 0; i <= shorter.length - len; i++) {
      const sub = shorter.slice(i, i + len)
      if (longer.includes(sub)) return true
    }
  }
  return false
}

/**
 * 判断附图是否应保留
 * @param {string} refName 文件名或 alt
 * @param {object} row 题目
 * @param {number} globalCount 该文件名在题库中出现次数
 */
export function isImageRelevantToQuestion(refName, row, globalCount = 1) {
  if (!refName || !isFileLikeImageRef(refName)) return false
  if (globalCount > 5) return false

  const examKey = extractExamKeyFromRef(refName)
  const hints = extractHintsFromQuestion(row)
  if (!examKey || !hints) return false

  return hasSubstantialOverlap(examKey, hints, 6)
}

export function extractImgAltsFromText(text = '') {
  const alts = []
  for (const tag of String(text).match(/<img\b[^>]*>/gi) || []) {
    const m = tag.match(IMG_ALT_RE)
    if (m?.[1]) alts.push(m[1].trim())
  }
  return alts
}

export function stripQuestionFigureTags(text = '') {
  return String(text ?? '').replace(IMG_TAG_RE, '').replace(/\n{3,}/g, '\n\n').trim()
}

export function stripNonFileImageRefs(text = '') {
  return String(text ?? '').replace(/\[附图:\s*([^\]]+)\]/g, (full, name) => {
    return isFileLikeImageRef(name.trim()) ? full : ''
  })
}

export function sanitizeQuestionImages(row, globalRefCounts = new Map()) {
  const out = { ...row }
  for (const field of ['content', 'analysis', 'answer']) {
    let text = String(out[field] ?? '')
    if (!text) continue

    text = text.replace(/<img\b[^>]*class="question-figure"[^>]*\/?>/gi, (tag) => {
      const m = tag.match(IMG_ALT_RE)
      const alt = m?.[1]?.trim() || ''
      const count = globalRefCounts.get(alt) ?? 1
      return isImageRelevantToQuestion(alt, row, count) ? tag : ''
    })

    text = stripNonFileImageRefs(text)
    text = text.replace(/\n{3,}/g, '\n\n').trim()
    out[field] = text
  }
  return out
}
