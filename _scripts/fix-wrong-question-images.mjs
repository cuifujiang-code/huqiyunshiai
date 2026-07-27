/**
 * 清理批量导入题目中错挂的附图（整卷附图误关联到单题）
 *
 * 用法:
 *   node _scripts/fix-wrong-question-images.mjs           # 预览
 *   node _scripts/fix-wrong-question-images.mjs --execute
 */
import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'
import {
  extractImgAltsFromText,
  sanitizeQuestionImages,
  isImageRelevantToQuestion,
} from '../server/teacher/questionImageValidator.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const EXECUTE = process.argv.includes('--execute')

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
for (const [k, v] of Object.entries(env)) if (v) process.env[k] = v
const admin = createClient(env.SUPABASE_URL || env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

async function fetchAll() {
  const all = []
  let from = 0
  while (true) {
    const { data, error } = await admin
      .from('teacher_question_bank')
      .select('id, content, analysis, answer, source')
      .eq('source', '批量导入')
      .range(from, from + 999)
    if (error) throw error
    if (!data?.length) break
    all.push(...data)
    if (data.length < 1000) break
    from += 1000
  }
  return all
}

async function main() {
  console.log(EXECUTE ? '=== 执行错挂附图清理 ===' : '=== 预览错挂附图清理 ===')
  const rows = await fetchAll()

  const globalRefCounts = new Map()
  for (const row of rows) {
    for (const field of ['content', 'analysis', 'answer']) {
      for (const alt of extractImgAltsFromText(row[field])) {
        globalRefCounts.set(alt, (globalRefCounts.get(alt) ?? 0) + 1)
      }
    }
  }

  let removedImgs = 0
  let keptImgs = 0
  const updates = []

  for (const row of rows) {
    const beforeImgs = extractImgAltsFromText(`${row.content}${row.analysis}${row.answer}`).length
    const cleaned = sanitizeQuestionImages(row, globalRefCounts)
    const afterImgs = extractImgAltsFromText(`${cleaned.content}${cleaned.analysis}${cleaned.answer}`).length

    removedImgs += Math.max(0, beforeImgs - afterImgs)
    keptImgs += afterImgs

    const changed =
      cleaned.content !== row.content
      || cleaned.analysis !== row.analysis
      || cleaned.answer !== row.answer

    if (changed) {
      updates.push({
        id: row.id,
        content: cleaned.content,
        analysis: cleaned.analysis,
        answer: cleaned.answer,
        updated_at: new Date().toISOString(),
      })
    }
  }

  console.log(`扫描 ${rows.length} 条`)
  console.log(`将移除错挂附图约 ${removedImgs} 处，保留 ${keptImgs} 处`)
  console.log(`待更新 ${updates.length} 条`)

  const sample = updates.find((u) => u.content.includes('<img'))
  if (sample) {
    console.log('\n保留附图样本:', sample.content.slice(0, 280))
  }
  const removedSample = updates.find((u) => !u.content.includes('<img') && rows.find((r) => r.id === u.id)?.content.includes('<img'))
  if (removedSample) {
    console.log('\n移除附图样本:', removedSample.content.slice(0, 200))
  }

  if (!EXECUTE || !updates.length) {
    if (!EXECUTE && updates.length) console.log('\n确认: node _scripts/fix-wrong-question-images.mjs --execute')
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
