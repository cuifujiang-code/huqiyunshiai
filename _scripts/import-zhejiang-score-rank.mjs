/**
 * 浙江省一分一段表批量导入
 *
 * 用法:
 *   node _scripts/import-zhejiang-score-rank.mjs [--execute] [--file path/to.csv|xlsx]
 *
 * 默认读取 data/zhejiang/score_rank_integrated.csv
 * 支持 CSV / Excel（需 xlsx 包）
 */
import { readFileSync, existsSync } from 'fs'
import { join, dirname, extname } from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const EXECUTE = process.argv.includes('--execute')
const fileArgIdx = process.argv.indexOf('--file')
const INPUT = fileArgIdx >= 0
  ? process.argv[fileArgIdx + 1]
  : join(root, 'data/zhejiang/score_rank_integrated.csv')

const REQUIRED_COLS = [
  'exam_year', 'score', 'rank', 'section_num',
  'category', 'subject_type', 'batch', 'rank_percent', 'total_student',
]

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

function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean)
  if (!lines.length) return []
  const headers = lines[0].split(',').map((h) => h.trim())
  return lines.slice(1).map((line) => {
    const vals = line.split(',')
    const row = {}
    headers.forEach((h, i) => { row[h] = (vals[i] ?? '').trim() })
    return row
  })
}

async function parseExcel(path) {
  const XLSX = await import('xlsx')
  const wb = XLSX.readFile(path)
  const sheet = wb.Sheets[wb.SheetNames[0]]
  return XLSX.utils.sheet_to_json(sheet, { defval: '' })
}

function validateRow(raw, lineNo) {
  const errors = []
  const examYear = Number(raw.exam_year)
  const score = Number(raw.score)
  const rank = Number(raw.rank)
  const sectionNum = Number(raw.section_num)
  const totalStudent = Number(raw.total_student)
  const rankPercent = Number(raw.rank_percent)

  if (!Number.isInteger(examYear) || examYear < 2020) {
    errors.push(`行${lineNo}: exam_year 无效`)
  }
  if (!Number.isInteger(score) || score < 0 || score > 750) {
    errors.push(`行${lineNo}: score 须在 0-750`)
  }
  if (!Number.isInteger(rank) || rank <= 0) {
    errors.push(`行${lineNo}: rank 须为正整数`)
  }
  if (!Number.isInteger(sectionNum) || sectionNum < 0) {
    errors.push(`行${lineNo}: section_num 无效`)
  }
  if (!Number.isInteger(totalStudent) || totalStudent <= 0) {
    errors.push(`行${lineNo}: total_student 无效`)
  }
  if (Number.isNaN(rankPercent) || rankPercent < 0 || rankPercent > 1) {
    errors.push(`行${lineNo}: rank_percent 须在 0-1`)
  }
  const category = String(raw.category || '普通类').trim()
  const subjectType = String(raw.subject_type || '综合类').trim()
  const batch = String(raw.batch || '').trim() || null

  if (errors.length) return { valid: false, errors }

  return {
    valid: true,
    row: {
      exam_year: examYear,
      score,
      rank,
      section_num: sectionNum,
      category,
      subject_type: subjectType,
      batch,
      rank_percent: rankPercent,
      total_student: totalStudent,
    },
  }
}

function dedupeKey(r) {
  return `${r.exam_year}|${r.category}|${r.subject_type}|${r.score}|${r.batch ?? ''}`
}

async function main() {
  if (!existsSync(INPUT)) {
    console.error(`文件不存在: ${INPUT}`)
    process.exit(1)
  }

  let rawRows
  const ext = extname(INPUT).toLowerCase()
  if (ext === '.csv') {
    rawRows = parseCsv(readFileSync(INPUT, 'utf8'))
  } else if (ext === '.xlsx' || ext === '.xls') {
    rawRows = await parseExcel(INPUT)
  } else {
    console.error('仅支持 .csv / .xlsx / .xls')
    process.exit(1)
  }

  console.log(`读取 ${rawRows.length} 行 ← ${INPUT}`)

  const validRows = []
  const invalid = []
  const seen = new Map()
  let dupCount = 0

  rawRows.forEach((raw, idx) => {
    const lineNo = idx + 2
    const result = validateRow(raw, lineNo)
    if (!result.valid) {
      invalid.push(...result.errors)
      return
    }
    const key = dedupeKey(result.row)
    if (seen.has(key)) {
      dupCount += 1
      return
    }
    seen.set(key, true)
    validRows.push(result.row)
  })

  console.log('\n=== 校验结果 ===')
  console.log(`总行数     : ${rawRows.length}`)
  console.log(`有效行数   : ${validRows.length}`)
  console.log(`去重跳过   : ${dupCount}`)
  console.log(`异常行数   : ${invalid.length}`)
  if (invalid.length) {
    console.log('\n异常明细（前20条）:')
    invalid.slice(0, 20).forEach((e) => console.log('  -', e))
  }

  const byYear = {}
  for (const r of validRows) {
    byYear[r.exam_year] = (byYear[r.exam_year] ?? 0) + 1
  }
  console.log('\n按年份统计:', byYear)

  if (!EXECUTE) {
    console.log('\n[预览模式] 加 --execute 写入 Supabase')
    return
  }

  const env = { ...loadEnvFile('.env'), ...loadEnvFile('.env.local'), ...process.env }
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL
  const key = env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('缺少 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
  const TABLE = 'zhejiang_score_rank'
  const BATCH = 200
  let inserted = 0

  for (let i = 0; i < validRows.length; i += BATCH) {
    const chunk = validRows.slice(i, i + BATCH)
    const { error } = await admin.from(TABLE).upsert(chunk, {
      onConflict: 'exam_year,category,subject_type,score,batch',
      ignoreDuplicates: false,
    })
    if (error) {
      console.error('写入失败:', error.message)
      process.exit(1)
    }
    inserted += chunk.length
    process.stdout.write(`\r已写入 ${inserted}/${validRows.length}`)
  }

  console.log('\n✅ 导入完成')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
