/**
 * 历史题目批量重绑专题标签
 * 用法: node _scripts/rebind-topic-tags.mjs [--execute]
 */
import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'
import { enrichTopicFields, hasTopicTaxonomy } from '../server/teacher/topicTaxonomy/index.js'

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
const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL
const key = env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('缺少 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
const TABLE = 'teacher_question_bank'
const BATCH = 200

async function fetchAll() {
  const all = []
  let from = 0
  while (true) {
    const { data, error } = await admin.from(TABLE).select('*').range(from, from + BATCH - 1)
    if (error) throw new Error(error.message)
    if (!data?.length) break
    all.push(...data)
    if (data.length < BATCH) break
    from += BATCH
  }
  return all
}

async function main() {
  const rows = await fetchAll()
  let eligible = 0
  let matched = 0
  let fallback = 0
  const updates = []

  for (const row of rows) {
    if (!hasTopicTaxonomy(row.grade, row.subject)) continue
    eligible += 1
    const enriched = enrichTopicFields(row)
    if (enriched.topic_tag === '综合题型') fallback += 1
    else matched += 1
    if (
      enriched.topic_group !== row.topic_group
      || enriched.topic_tag !== row.topic_tag
      || JSON.stringify(enriched.tags) !== JSON.stringify(row.tags)
    ) {
      updates.push({
        id: row.id,
        topic_group: enriched.topic_group,
        topic_tag: enriched.topic_tag,
        tags: enriched.tags,
        updated_at: new Date().toISOString(),
      })
    }
  }

  console.log(EXECUTE ? '=== 执行重绑 ===' : '=== 预览重绑 ===')
  console.log(`总题量: ${rows.length}`)
  console.log(`可归类科目: ${eligible}`)
  console.log(`预计匹配成功: ${matched}`)
  console.log(`预计归入综合题型: ${fallback}`)
  console.log(`需更新记录: ${updates.length}`)

  if (!EXECUTE || !updates.length) {
    if (!EXECUTE && updates.length) console.log('\n确认后运行: node _scripts/rebind-topic-tags.mjs --execute')
    return
  }

  for (let i = 0; i < updates.length; i += 50) {
    const chunk = updates.slice(i, i + 50)
    for (const u of chunk) {
      const { error } = await admin.from(TABLE).update({
        topic_group: u.topic_group,
        topic_tag: u.topic_tag,
        tags: u.tags,
        updated_at: u.updated_at,
      }).eq('id', u.id)
      if (error) throw new Error(error.message)
    }
    console.log(`  已更新 ${Math.min(i + 50, updates.length)} / ${updates.length}`)
  }
  console.log('完成')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
