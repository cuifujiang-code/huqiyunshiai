/**
 * 批量导入题目 — 年级重分类 + 专题自动打标
 *
 * 用法:
 *   node _scripts/reclassify-import-questions.mjs                    # 预览
 *   node _scripts/reclassify-import-questions.mjs --execute          # 执行
 *   node _scripts/reclassify-import-questions.mjs --execute --source=批量导入
 *   node _scripts/reclassify-import-questions.mjs --execute --subject=数学
 */
import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'
import {
  enrichTopicFields,
  hasTopicTaxonomy,
  inferGradeForQuestion,
  FALLBACK_TAG,
} from '../server/teacher/topicTaxonomy/index.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const EXECUTE = process.argv.includes('--execute')
const BATCH = 200

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
const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL
const key = env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('缺少 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const SOURCE_FILTER = parseArg('source', '批量导入')
const SUBJECT_FILTER = parseArg('subject', '')
const TEACHER_FILTER = parseArg('teacher-id', '')

const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
const TABLE = 'teacher_question_bank'

async function fetchAll() {
  const all = []
  let from = 0
  while (true) {
    let query = admin.from(TABLE).select('*').range(from, from + BATCH - 1)
    if (SOURCE_FILTER) query = query.eq('source', SOURCE_FILTER)
    if (SUBJECT_FILTER) query = query.eq('subject', SUBJECT_FILTER)
    if (TEACHER_FILTER) query = query.eq('teacher_id', TEACHER_FILTER)
    const { data, error } = await query
    if (error) throw new Error(error.message)
    if (!data?.length) break
    all.push(...data)
    if (data.length < BATCH) break
    from += BATCH
  }
  return all
}

async function main() {
  console.log(EXECUTE ? '=== 执行年级重分 + 专题打标 ===' : '=== 预览年级重分 + 专题打标 ===')
  console.log(`筛选: source=${SOURCE_FILTER || '全部'} subject=${SUBJECT_FILTER || '全部'} teacher=${TEACHER_FILTER || '全部'}`)

  const rows = await fetchAll()
  console.log(`读取 ${rows.length} 条`)

  const gradeDistBefore = {}
  const gradeDistAfter = {}
  let gradeChanged = 0
  let topicMatched = 0
  let topicFallback = 0
  const updates = []

  for (const row of rows) {
    if (!hasTopicTaxonomy(row.grade, row.subject) && !hasTopicTaxonomy('高二', row.subject)) {
      continue
    }

    gradeDistBefore[row.grade] = (gradeDistBefore[row.grade] ?? 0) + 1

    const newGrade = inferGradeForQuestion(row)
    const enriched = enrichTopicFields({ ...row, grade: newGrade })

    gradeDistAfter[newGrade] = (gradeDistAfter[newGrade] ?? 0) + 1
    if (newGrade !== row.grade) gradeChanged += 1
    if (enriched.topic_tag && enriched.topic_tag !== FALLBACK_TAG) topicMatched += 1
    else topicFallback += 1

    const changed =
      newGrade !== row.grade
      || enriched.topic_group !== (row.topic_group || '')
      || enriched.topic_tag !== (row.topic_tag || '')
      || JSON.stringify(enriched.tags ?? []) !== JSON.stringify(row.tags ?? [])

    if (changed) {
      updates.push({
        id: row.id,
        grade: newGrade,
        topic_group: enriched.topic_group,
        topic_tag: enriched.topic_tag,
        tags: enriched.tags,
        updated_at: new Date().toISOString(),
      })
    }
  }

  console.log('\n--- 年级分布（前）---')
  console.log(gradeDistBefore)
  console.log('--- 年级分布（后）---')
  console.log(gradeDistAfter)
  console.log(`\n年级调整: ${gradeChanged} 条`)
  console.log(`专题匹配: ${topicMatched} 条`)
  console.log(`归入综合题型: ${topicFallback} 条`)
  console.log(`待更新: ${updates.length} 条`)

  if (!EXECUTE || !updates.length) {
    if (!EXECUTE && updates.length) {
      console.log('\n确认后执行: node _scripts/reclassify-import-questions.mjs --execute')
    }
    return
  }

  for (let i = 0; i < updates.length; i += 50) {
    const chunk = updates.slice(i, i + 50)
    for (const u of chunk) {
      const { error } = await admin.from(TABLE).update({
        grade: u.grade,
        topic_group: u.topic_group,
        topic_tag: u.topic_tag,
        tags: u.tags,
        updated_at: u.updated_at,
      }).eq('id', u.id)
      if (error) throw new Error(error.message)
    }
    console.log(`  已更新 ${Math.min(i + 50, updates.length)} / ${updates.length}`)
  }
  console.log('✅ 完成')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
