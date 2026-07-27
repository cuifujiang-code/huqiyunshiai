/**
 * 验证扩充种子数据后冲稳保分布
 * 用法: node _scripts/verify_admission_seed.js
 */
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { generateVolunteerRecommendations } from '../teacher-api/server/volunteerEngine.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

const seed = JSON.parse(
  readFileSync(
    join(root, 'teacher-api/knowledge-base/volunteer-filling/admission-seed-zhejiang-physics.json'),
    'utf-8',
  ),
)

const rows = []
for (const entry of seed.entries) {
  for (const rec of entry.records) {
    rows.push({
      id: `${entry.college_name}-${entry.major_name}-${rec.year}`,
      college_name: entry.college_name,
      major_name: entry.major_name,
      province: seed.meta.province,
      year: rec.year,
      subject_type: seed.meta.subject_type,
      batch_type: seed.meta.batch_type,
      min_score: rec.min_score,
      avg_score: rec.avg_score,
      min_rank: rec.min_rank,
      avg_rank: rec.avg_rank,
      enrollment_count: rec.enrollment_count,
      subject_requirement: entry.subject_requirement,
    })
  }
}

// 合并 017 已有数据（浙大、杭电、浙工大等）
const legacy = [
  ['浙江大学', '计算机科学与技术', 2024, 685, 692, 3200, 2800],
  ['浙江大学', '计算机科学与技术', 2023, 682, 689, 3500, 3100],
  ['浙江大学', '计算机科学与技术', 2022, 680, 686, 3800, 3400],
  ['杭州电子科技大学', '计算机科学与技术', 2024, 628, 635, 28000, 25000],
  ['杭州电子科技大学', '计算机科学与技术', 2023, 625, 632, 30000, 27000],
  ['杭州电子科技大学', '计算机科学与技术', 2022, 622, 629, 32000, 29000],
  ['浙江工业大学', '计算机科学与技术', 2024, 610, 618, 42000, 38000],
  ['浙江工业大学', '计算机科学与技术', 2023, 608, 615, 44000, 40000],
  ['浙江工业大学', '计算机科学与技术', 2022, 605, 612, 46000, 42000],
]
for (const [college, major, year, minScore, avgScore, minRank, avgRank] of legacy) {
  rows.push({
    id: `${college}-${major}-${year}`,
    college_name: college,
    major_name: major,
    province: '浙江',
    year,
    subject_type: '物理类',
    batch_type: '本科',
    min_score: minScore,
    avg_score: avgScore,
    min_rank: minRank,
    avg_rank: avgRank,
    enrollment_count: 100,
    subject_requirement: '物理',
  })
}

const input = {
  province: '浙江',
  subjectType: '物理类',
  subjects: ['物理', '化学'],
  batchType: '本科',
  intendedMajors: ['计算机'],
  rank: 45001,
}

const { items, tierStrategy } = generateVolunteerRecommendations(rows, input)
const byTier = { 冲: [], 稳: [], 保: [] }
for (const item of items) byTier[item.tierLabel].push(item)

console.log('=== 位次 45001 · 意向计算机 ===')
console.log(`总计: ${items.length} 条 (冲 ${byTier.冲.length} / 稳 ${byTier.稳.length} / 保 ${byTier.保.length})`)
console.log('\n冲档样例:')
byTier.冲.slice(0, 3).forEach((i) =>
  console.log(`  ${i.collegeName} ${i.majorName} 概率${(i.probability * 100).toFixed(1)}% 预测位次${i.predictedRank}`),
)
console.log('\n稳档样例:')
byTier.稳.slice(0, 3).forEach((i) =>
  console.log(`  ${i.collegeName} ${i.majorName} 概率${(i.probability * 100).toFixed(1)}% 预测位次${i.predictedRank}`),
)
console.log('\n保档样例:')
byTier.保.slice(0, 3).forEach((i) =>
  console.log(`  ${i.collegeName} ${i.majorName} 概率${(i.probability * 100).toFixed(1)}% 预测位次${i.predictedRank}`),
)

if (byTier.稳.length === 0 || byTier.保.length === 0) {
  console.error('\n❌ 稳/保仍为空，需调整位次数据')
  process.exit(1)
}
console.log('\n✅ 冲稳保均有推荐')
