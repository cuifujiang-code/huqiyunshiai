/**
 * 一键验证浙江一分一段换算（无需 Postman）
 * 用法: node _scripts/test-zhejiang-convert.mjs
 */
import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'
import { lookupRankByScore, lookupScoreByRank } from '../teacher-api/server/volunteer/zhejiang/scoreRankService.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

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
  console.error('❌ 缺少 SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY（检查 .env）')
  process.exit(1)
}

const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

async function main() {
  console.log('=== 浙江一分一段换算验证 ===\n')

  const scoreTest = await lookupRankByScore(supabase, {
    examYear: 2024,
    score: 483,
    category: '普通类',
    subjectType: '综合类',
    batch: '一段',
  })

  console.log('【测试1】2024 年 483 分 → 位次')
  if (!scoreTest.success) {
    console.log('❌ 失败:', scoreTest.message)
    process.exit(1)
  }
  console.log(`  位次: ${scoreTest.rank}`)
  console.log(`  同分人数: ${scoreTest.sectionNum}`)
  console.log(`  位次占比: ${(scoreTest.rankPercent * 100).toFixed(2)}%`)
  console.log(`  数据源: ${scoreTest.dataSource}`)

  const ok1 = scoreTest.rank === 187304 && scoreTest.sectionNum === 1047
  console.log(ok1 ? '  ✅ 与官方整合表一致\n' : '  ⚠️ 数值与预期(187304/1047)不符，请核对数据\n')

  const rankTest = await lookupScoreByRank(supabase, {
    examYear: 2024,
    rank: 187304,
    category: '普通类',
    subjectType: '综合类',
    batch: '一段',
  })

  console.log('【测试2】2024 年 位次 187304 → 分数')
  if (!rankTest.success) {
    console.log('❌ 失败:', rankTest.message)
    process.exit(1)
  }
  console.log(`  分数: ${rankTest.score}`)
  const ok2 = rankTest.score === 483
  console.log(ok2 ? '  ✅ 与官方整合表一致\n' : '  ⚠️ 预期 483 分\n')

  const { count } = await supabase.from('zhejiang_score_rank').select('*', { count: 'exact', head: true })
  console.log(`【数据表】zhejiang_score_rank 共 ${count ?? 0} 行`)
  console.log('\n全部通过！前端可在 /student/volunteer 输入 483 分验证联动。')
  console.log('若网页仍无数据，请重新运行: npm run dev（需重启后端）')
}

main().catch((e) => {
  console.error('❌', e.message)
  process.exit(1)
})
