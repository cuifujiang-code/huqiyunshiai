/**
 * 题库批量导入 · 本地附图索引与解析
 */
import { readdirSync, existsSync, readFileSync } from 'fs'
import { join, extname } from 'path'
import { createHash } from 'crypto'
import { spawnSync } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const DEFAULT_IMAGE_DIR = process.env.QUESTION_BANK_IMAGE_DIR || 'E:/待录入题库/图片'
const SCRIPTS_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../_scripts')

export const IMAGE_REF_RE = /\[附图:\s*([^\]]+)\]/g

/** 是否为有效文件名型附图引用（排除纯中文描述） */
export function isFileLikeImageRef(name = '') {
  const t = String(name).trim()
  if (!t || t.length < 4) return false
  if (/\.(wmf|emf|png|jpe?g|gif|bmp|webp)$/i.test(t)) return true
  if (/_p\d+_\d+/i.test(t) || /_图\d+/i.test(t)) return true
  if (/[\w\u4e00-\u9fff].*[_-]\d+\.(wmf|png|jpe?g)/i.test(t)) return true
  return false
}

export function extractImageRefs(text = '') {
  const refs = []
  const raw = String(text ?? '')
  let m
  IMAGE_REF_RE.lastIndex = 0
  while ((m = IMAGE_REF_RE.exec(raw)) !== null) {
    const name = m[1].trim()
    if (isFileLikeImageRef(name)) refs.push(name)
  }
  return refs
}

let cachedIndex = null
let cachedDir = null

export function buildImageIndex(imageDir = DEFAULT_IMAGE_DIR) {
  if (cachedIndex && cachedDir === imageDir) return cachedIndex

  const index = new Map()
  if (!existsSync(imageDir)) {
    console.warn('[questionImageIndex] 图片目录不存在:', imageDir)
    cachedIndex = index
    cachedDir = imageDir
    return index
  }

  for (const filename of readdirSync(imageDir)) {
    const full = join(imageDir, filename)
    const lower = filename.toLowerCase()
    index.set(lower, full)
    const noExt = filename.replace(/\.(wmf|emf|png|jpe?g|gif|bmp|webp)$/i, '')
    index.set(noExt.toLowerCase(), full)
  }

  cachedIndex = index
  cachedDir = imageDir
  return index
}

export function resolveImageFile(refName, imageDir = DEFAULT_IMAGE_DIR) {
  const index = buildImageIndex(imageDir)
  const name = String(refName).trim()
  const candidates = [
    name.toLowerCase(),
    name.replace(/\.(wmf|emf|png|jpe?g)$/i, '').toLowerCase(),
  ]
  for (const key of candidates) {
    if (index.has(key)) return index.get(key)
  }
  return null
}

export function hashImageRef(refName) {
  return createHash('md5').update(String(refName).trim()).digest('hex')
}

/** WMF/EMF → PNG buffer（依赖 Pillow + Windows GDI） */
export function convertToPngBuffer(filePath) {
  const ext = extname(filePath).toLowerCase()
  if (!/\.(wmf|emf)$/i.test(ext)) {
    return { buffer: readFileSync(filePath), mime: mimeFromExt(ext) }
  }

  const pyScript = join(SCRIPTS_DIR, 'wmf_to_png.py')
  if (!existsSync(pyScript)) {
    console.warn('[questionImageIndex] wmf_to_png.py 不存在，跳过 WMF:', filePath)
    return null
  }

  const result = spawnSync('python', [pyScript, filePath], {
    encoding: 'buffer',
    maxBuffer: 20 * 1024 * 1024,
  })

  if (result.status !== 0 || !result.stdout?.length) {
    console.warn('[questionImageIndex] WMF 转换失败:', filePath, result.stderr?.toString()?.slice(0, 200))
    return null
  }

  return { buffer: result.stdout, mime: 'image/png' }
}

function mimeFromExt(ext) {
  const map = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp',
  }
  return map[ext.toLowerCase()] || 'image/png'
}

export function buildFigureImgTag(url, alt = '附图') {
  const safeAlt = String(alt).replace(/"/g, '&quot;')
  return `<img src="${url}" alt="${safeAlt}" class="question-figure" style="display:block;max-width:100%;height:auto;margin:8px 0;border-radius:4px;" />`
}

export function replaceImageRefsInText(text, urlMap) {
  if (!text || !urlMap?.size) return text
  return String(text).replace(IMAGE_REF_RE, (full, name) => {
    const key = String(name).trim()
    const url = urlMap.get(key)
    return url ? buildFigureImgTag(url, key) : full
  })
}
