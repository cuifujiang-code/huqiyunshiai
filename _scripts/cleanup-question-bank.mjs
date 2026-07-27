/**
 * 清理教师题库：删除重复题 + 公式不完整题
 * 用法：
 *   node _scripts/cleanup-question-bank.mjs           # 预览
 *   node _scripts/cleanup-question-bank.mjs --execute # 执行删除
 */
import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'
import { isIncompleteQuestion } from '../server/batch/questionCompleteness.js'

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
const BATCH = 500

const FORMULA_PLACEHOLDER_RE = /【公式】|【公式待补】/
const INCOMPLETE_LATEX_RE = /\$\s*\.\.\.\s*\$|\$\$[\s\S]*?\{\s*\.\.\.\s*[\s\S]*?\$\$|\$\$[\s\S]*?\.\.\.[\s\S]*?\$\$/
const STRIPPED_FORMULA_RE = /(?:满足|为|则|是|得|有|设|若|当|且|或|的|等于|,|，|；|。|\.|\s){3,}/

function normalizeContent(text) {
  return String(text ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/【公式】|【公式待补】|\[图片占位符\]|【图片】/g, '')
    .replace(/\$\$[\s\S]*?\$\$/g, 'M')
    .replace(/\$[^$\n]+\$/g, 'm')
    .replace(/^\s*\d{1,3}[\.．、]\s*/, '')
    .replace(/\s+/g, '')
    .toLowerCase()
}

function fingerprint(q) {
  const opts = Array.isArray(q.options) ? q.options.join('|') : ''
  return normalizeContent(`${q.content}|${opts}|${q.answer}`)
}

function countFormulaPlaceholders(q) {
  const parts = [q.content, q.analysis, q.answer, ...(Array.isArray(q.options) ? q.options : [])]
  return parts.reduce((n, p) => n + (String(p ?? '').match(/【公式】|【公式待补】/g)?.length ?? 0), 0)
}

function hasUnclosedDollarMath(text) {
  const s = String(text ?? '')
  if (!s.includes('$')) return false
  const withoutBlock = s.replace(/\$\$[\s\S]*?\$\$/g, '')
  const singles = withoutBlock.match(/(^|[^\\])\$/g)
  return Boolean(singles && singles.length % 2 !== 0)
}

/** 题干中曾有公式但被 OCR/拆题弄丢，只剩逗号与虚词 */
function hasStrippedFormulaContent(q) {
  const content = String(q.content ?? '').replace(/\s+/g, '')
  if (content.length < 15) return false
  const hadMathHint = /公式|方程|函数|数列|向量|导数|积分|概率|抛物线|椭圆|双曲线|三角|不等式/.test(content)
  const mathTokens = (content.match(/\$[^$]+\$/g) || []).length
  if (mathTokens > 0) return false
  if (!hadMathHint && !/满足.*且.*则|复数.*则|已知.*则/.test(content)) return false
  return STRIPPED_FORMULA_RE.test(content) && !/[0-9a-zA-Zα-ωΑ-Ω\\=_+\-*/^]{2,}/.test(content)
}

function hasIncompleteFormula(q) {
  const content = String(q.content ?? '')
  const analysis = String(q.analysis ?? '')
  const tags = Array.isArray(q.tags) ? q.tags : []
  if (FORMULA_PLACEHOLDER_RE.test(content) || FORMULA_PLACEHOLDER_RE.test(analysis)) return true
  if (tags.some((t) => String(t).includes('含公式占位符'))) return true
  if (INCOMPLETE_LATEX_RE.test(content) || INCOMPLETE_LATEX_RE.test(analysis)) return true

  const placeholders = countFormulaPlaceholders(q)
  const latexBlocks = Array.isArray(q.latex_blocks) ? q.latex_blocks.filter(Boolean) : []
  if (placeholders > 0 && latexBlocks.length < placeholders) return true

  const allText = [content, analysis, q.answer, ...(Array.isArray(q.options) ? q.options : [])].join('\n')
  if (/\$\$\s*\$\$/.test(allText)) return true
  if (hasUnclosedDollarMath(allText)) return true
  if (hasStrippedFormulaContent(q)) return true
  return false
}

function questionScore(q) {
  let s = String(q.content ?? '').length
  s += String(q.analysis ?? '').length * 0.5
  s += (Array.isArray(q.options) ? q.options.join('').length : 0) * 1.5
  s += (Array.isArray(q.latex_blocks) ? q.latex_blocks.length : 0) * 10
  if (hasIncompleteFormula(q)) s -= 5000
  if (isIncompleteQuestion(q)) s -= 5000
  s += new Date(q.updated_at || q.created_at || 0).getTime() / 1e12
  return s
}

function findDuplicates(rows) {
  const byTeacher = new Map()
  for (const row of rows) {
    const tid = row.teacher_id || '_'
    if (!byTeacher.has(tid)) byTeacher.set(tid, new Map())
    const fp = fingerprint(row)
    if (fp.length < 12) continue
    const map = byTeacher.get(tid)
    if (!map.has(fp)) map.set(fp, [])
    map.get(fp).push(row)
  }

  const toDelete = []
  for (const [, fpMap] of byTeacher) {
    for (const [, group] of fpMap) {
      if (group.length < 2) continue
      const sorted = [...group].sort((a, b) => questionScore(b) - questionScore(a))
      toDelete.push(...sorted.slice(1))
    }
  }
  return toDelete
}

async function fetchAllQuestions() {
  const all = []
  let from = 0
  while (true) {
    const { data, error } = await admin
      .from(TABLE)
      .select('id, teacher_id, subject, content, options, answer, analysis, tags, latex_blocks, question_type, created_at, updated_at')
      .range(from, from + BATCH - 1)
    if (error) throw new Error(error.message)
    if (!data?.length) break
    all.push(...data)
    if (data.length < BATCH) break
    from += BATCH
  }
  return all
}

async function deleteInBatches(ids) {
  const unique = [...new Set(ids)]
  for (let i = 0; i < unique.length; i += 100) {
    const chunk = unique.slice(i, i + 100)
    const { error } = await admin.from(TABLE).delete().in('id', chunk)
    if (error) throw new Error(error.message)
    console.log(`  已删除 ${Math.min(i + 100, unique.length)} / ${unique.length}`)
  }
  return unique.length
}

async function main() {
  console.log(EXECUTE ? '=== 执行清理 ===' : '=== 预览模式（加 --execute 执行删除）===')
  const rows = await fetchAllQuestions()
  console.log(`题库总题量: ${rows.length}`)

  const incompleteFormula = rows.filter(hasIncompleteFormula)
  const incompleteContent = rows.filter(isIncompleteQuestion)
  const incompleteIds = new Set([
    ...incompleteFormula.map((r) => r.id),
    ...incompleteContent.map((r) => r.id),
  ])

  const dupRows = findDuplicates(rows.filter((r) => !incompleteIds.has(r.id)))
  const dupIds = new Set(dupRows.map((r) => r.id))

  const deleteIds = [...new Set([...incompleteIds, ...dupIds])]

  console.log('\n统计:')
  console.log(`  公式不完整: ${incompleteFormula.length}`)
  console.log(`  内容残缺/占位: ${incompleteContent.length}`)
  console.log(`  重复题(待删副本): ${dupRows.length}`)
  console.log(`  合计待删: ${deleteIds.length}`)
  console.log(`  保留: ${rows.length - deleteIds.length}`)

  if (incompleteFormula.length) {
    console.log('\n公式不完整示例 (最多 5 条):')
    incompleteFormula.slice(0, 5).forEach((q) => {
      console.log(`  - ${q.id.slice(0, 8)} | ${q.subject} | ${String(q.content).slice(0, 60).replace(/\n/g, ' ')}…`)
    })
  }
  if (dupRows.length) {
    console.log('\n重复题示例 (最多 5 条):')
    dupRows.slice(0, 5).forEach((q) => {
      console.log(`  - ${q.id.slice(0, 8)} | ${q.subject} | ${String(q.content).slice(0, 60).replace(/\n/g, ' ')}…`)
    })
  }

  if (!deleteIds.length) {
    console.log('\n无需删除。')
    return
  }

  if (!EXECUTE) {
    console.log('\n预览完成。确认后运行: node _scripts/cleanup-question-bank.mjs --execute')
    return
  }

  const deleted = await deleteInBatches(deleteIds)
  console.log(`\n完成，共删除 ${deleted} 道题。`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
