/**
 * 从 admission-seed-zhejiang-physics.json 生成 Supabase 迁移 SQL
 * 用法: node _scripts/generate_admission_seed_sql.js
 */
import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const seedPath = join(
  root,
  'teacher-api/knowledge-base/volunteer-filling/admission-seed-zhejiang-physics.json',
)
const outPath = join(root, 'supabase/migrations/018_volunteer_admission_data_expand.sql')

const seed = JSON.parse(readFileSync(seedPath, 'utf-8'))
const { province, subject_type, batch_type } = seed.meta

const values = []
for (const entry of seed.entries) {
  for (const rec of entry.records) {
    values.push(
      `  ('${entry.college_name.replace(/'/g, "''")}', '${entry.major_name.replace(/'/g, "''")}', '${province}', ${rec.year}, '${subject_type}', '${batch_type}', ${rec.min_score}, ${rec.avg_score}, ${rec.min_rank}, ${rec.avg_rank}, ${rec.enrollment_count}, '${entry.subject_requirement}')`,
    )
  }
}

const sql = `-- 018: 扩充浙江省物理类本科录取数据（计算机及相关专业全位次段）
-- 数据源: teacher-api/knowledge-base/volunteer-filling/admission-seed-zhejiang-physics.json
-- 生成: node _scripts/generate_admission_seed_sql.js

INSERT INTO college_admission_data
  (college_name, major_name, province, year, subject_type, batch_type, min_score, avg_score, min_rank, avg_rank, enrollment_count, subject_requirement)
VALUES
${values.join(',\n')}
ON CONFLICT (college_name, major_name, province, year, subject_type, batch_type) DO NOTHING;
`

writeFileSync(outPath, sql, 'utf-8')
console.log(`Wrote ${values.length} rows to ${outPath}`)
