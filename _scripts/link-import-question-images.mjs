/**
 * 将批量导入题目的 [附图: ...] 占位符关联到实际图片并写入 Supabase Storage
 *
 * 用法:
 *   node _scripts/link-import-question-images.mjs              # 预览
 *   node _scripts/link-import-question-images.mjs --execute    # 执行
 *   node _scripts/link-import-question-images.mjs --execute --limit=50
 */
import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'
import {
  extractImageRefs,
  resolveImageFile,
  convertToPngBuffer,
  replaceImageRefsInText,
  buildImageIndex,
} from '../server/teacher/questionImageIndex.js'
import { isImageRelevantToQuestion } from '../server/teacher/questionImageValidator.js'
import {
  isSupabaseStorageConfigured,
  uploadQuestionBankImage,
} from '../server/supabaseAdmin.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const EXECUTE = process.argv.includes('--execute')

function parseArg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.split('=').slice(1).join('=') : fallback
}

function loadEnvFile(rel) {
  const p = join(root, rel)
  if (!existsSync(p)) return {}
  const out = {}
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i < 1) continue
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '')
  }
  return out
}

const env = { ...loadEnvFile('.env'), ...loadEnvFile('.env.local'), ...process.env }
for (const [k, v] of Object.entries(env)) {
  if (v != null && v !== '') process.env[k] = v
}
const admin = createClient(env.SUPABASE_URL || env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const LIMIT = Number(parseArg('limit', '0')) || 0
const SOURCE = parseArg('source', '批量导入')
const IMAGE_DIR = parseArg('image-dir', process.env.QUESTION_BANK_IMAGE_DIR || 'E:/待录入题库/图片')

const urlCache = new Map()
let uploadOk = 0
let uploadFail = 0

async function resolveImageUrl(refName) {
  if (urlCache.has(refName)) return urlCache.get(refName)

  const filePath = resolveImageFile(refName, IMAGE_DIR)
  if (!filePath) {
    urlCache.set(refName, null)
    return null
  }

  const converted = convertToPngBuffer(filePath)
  if (!converted?.buffer?.length) {
    urlCache.set(refName, null)
    return null
  }

  if (isSupabaseStorageConfigured()) {
    try {
      const url = await uploadQuestionBankImage(refName, converted.buffer, converted.mime)
      urlCache.set(refName, url)
      uploadOk++
      return url
    } catch (err) {
      uploadFail++
      console.warn('上传失败:', refName, err.message)
    }
  }

  const apiUrl = `/api/teacher/question-images?name=${encodeURIComponent(refName)}`
  urlCache.set(refName, apiUrl)
  return apiUrl
}

async function fetchQuestions() {
  const all = []
  let from = 0
  while (true) {
    let q = admin.from('teacher_question_bank').select('id, content, analysis, answer, source').range(from, from + 999)
    if (SOURCE) q = q.eq('source', SOURCE)
    const { data, error } = await q
    if (error) throw error
    if (!data?.length) break
    all.push(...data)
    if (data.length < 1000) break
    from += 1000
  }
  return all
}

async function main() {
  console.log(EXECUTE ? '=== 执行附图关联 ===' : '=== 预览附图关联 ===')
  console.log('图片目录:', IMAGE_DIR)
  buildImageIndex(IMAGE_DIR)

  const rows = await fetchQuestions()
  const withRefs = rows.filter((r) => /\[附图:/.test(`${r.content}${r.analysis}${r.answer}`))
  const targets = LIMIT > 0 ? withRefs.slice(0, LIMIT) : withRefs

  console.log(`总题 ${rows.length}，含附图 ${withRefs.length}，处理 ${targets.length}`)

  const allRefs = new Set()
  for (const r of targets) {
    for (const ref of [...extractImageRefs(r.content), ...extractImageRefs(r.analysis), ...extractImageRefs(r.answer)]) {
      allRefs.add(ref)
    }
  }
  console.log(`需解析 ${allRefs.size} 个唯一附图`)

  for (const ref of allRefs) {
    await resolveImageUrl(ref)
  }
  console.log(`图片上传成功 ${uploadOk}，失败 ${uploadFail}，API回退 ${[...urlCache.values()].filter((u) => u?.startsWith('/api/')).length}`)

  const updates = []
  for (const row of targets) {
    const urlMap = new Map()
    for (const ref of [...extractImageRefs(row.content), ...extractImageRefs(row.analysis), ...extractImageRefs(row.answer)]) {
      if (!isImageRelevantToQuestion(ref, row, 1)) continue
      const url = urlCache.get(ref) ?? await resolveImageUrl(ref)
      if (url) urlMap.set(ref, url)
    }
    if (!urlMap.size) continue

    const content = replaceImageRefsInText(row.content, urlMap)
    const analysis = replaceImageRefsInText(row.analysis, urlMap)
    const answer = replaceImageRefsInText(row.answer, urlMap)

    if (content !== row.content || analysis !== row.analysis || answer !== row.answer) {
      updates.push({ id: row.id, content, analysis, answer, updated_at: new Date().toISOString() })
    }
  }

  console.log(`待更新 ${updates.length} 条`)
  if (updates[0]) {
    console.log('样本 content 片段:', updates[0].content.slice(0, 300))
  }

  if (!EXECUTE || !updates.length) {
    if (!EXECUTE) console.log('\n确认后执行: node _scripts/link-import-question-images.mjs --execute')
    return
  }

  for (let i = 0; i < updates.length; i += 50) {
    const chunk = updates.slice(i, i + 50)
    for (const u of chunk) {
      const { error } = await admin.from('teacher_question_bank').update({
        content: u.content,
        analysis: u.analysis,
        answer: u.answer,
        updated_at: u.updated_at,
      }).eq('id', u.id)
      if (error) throw error
    }
    console.log(`  已更新 ${Math.min(i + 50, updates.length)} / ${updates.length}`)
  }
  console.log('✅ 完成')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
