/**
 * 修复批量导入题目中误附的大量 [附图: ...] 占位符
 *
 * 用法:
 *   node _scripts/fix-import-image-placeholders.mjs           # 预览
 *   node _scripts/fix-import-image-placeholders.mjs --execute
 */
import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'
import {
  countImagePlaceholders,
  stripImagePlaceholders,
} from '../server/teacher/questionContentSanitize.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const EXECUTE = process.argv.includes('--execute')
const MAX_KEEP = 3

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
const admin = createClient(env.SUPABASE_URL || env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const SOURCE = parseArg('source', '批量导入')

async function fetchAll() {
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
  console.log(EXECUTE ? '=== 执行附图占位符清理 ===' : '=== 预览附图占位符清理 ===')
  const rows = await fetchAll()
  const updates = []

  for (const row of rows) {
    const beforeRefs = countImagePlaceholders(row.content)
      + countImagePlaceholders(row.analysis)
      + countImagePlaceholders(row.answer)
    if (beforeRefs <= MAX_KEEP) continue

    const content = stripImagePlaceholders(row.content, { maxKeep: MAX_KEEP })
    const analysis = stripImagePlaceholders(row.analysis, { maxKeep: MAX_KEEP })
    const answer = stripImagePlaceholders(row.answer, { maxKeep: MAX_KEEP })

    const afterRefs = countImagePlaceholders(content)
      + countImagePlaceholders(analysis)
      + countImagePlaceholders(answer)

    if (content !== row.content || analysis !== row.analysis || answer !== row.answer) {
      updates.push({
        id: row.id,
        content,
        analysis,
        answer,
        beforeRefs,
        afterRefs,
        updated_at: new Date().toISOString(),
      })
    }
  }

  console.log(`扫描 ${rows.length} 条，需修复 ${updates.length} 条`)
  const stripped = updates.reduce((s, u) => s + (u.beforeRefs - u.afterRefs), 0)
  console.log(`将移除附图占位符约 ${stripped} 个`)

  for (const u of updates.slice(0, 3)) {
    console.log(`\n样本 ${u.id}: ${u.beforeRefs} → ${u.afterRefs} refs`)
    console.log(u.content.slice(0, 200))
  }

  if (!EXECUTE || !updates.length) {
    if (!EXECUTE && updates.length) {
      console.log('\n确认后执行: node _scripts/fix-import-image-placeholders.mjs --execute')
    }
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
