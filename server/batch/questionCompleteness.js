/**
 * 题目完整度校验、选项提取、去重合并
 */

const INCOMPLETE_CONTENT_RE = /\{\s*\.\.\.\s*\}|\{\.\.\.\}|…{2,}|\.{4,}/
const INCOMPLETE_ANALYSIS_RE = /信息不完整|无法提供解析|具体内容缺失|条件缺失|坐标缺失|无法识别|题目信息不完整|缺失，无法/
const EMPTY_OPTION_RE = /^[A-Fa-f][\.．、\)）]?\s*$/

/** 从题干文本中提取 A/B/C/D 选项行 */
export function extractOptionsFromContent(content) {
  const text = String(content ?? '')
  const options = []
  const re = /(?:^|\n)\s*([A-Fa-f])[\.．、\)）]\s*(.+?)(?=\n\s*[A-Fa-f][\.．、\)）]|\n\s*$|$)/gs
  let m
  while ((m = re.exec(text)) !== null) {
    const label = m[1].toUpperCase()
    const body = m[2].trim()
    if (body && !EMPTY_OPTION_RE.test(`${label}. ${body}`)) {
      options.push(`${label}. ${body}`)
    }
  }
  return options
}

/** 从题干首行提取题号 */
export function extractLeadingQuestionNumber(content) {
  const firstLine = String(content ?? '').split('\n')[0] ?? ''
  const m = firstLine.match(/^\s*(\d{1,3})[\.．、]/)
  return m ? Number(m[1]) : null
}

/** 判断是否为残次/占位题目，应拒绝入库 */
export function isIncompleteQuestion(q) {
  if (!q || typeof q !== 'object') return true

  const content = String(q.content ?? '').trim()
  const analysis = String(q.analysis ?? '').trim()
  const options = Array.isArray(q.options) ? q.options : []

  if (!content || content.length < 8) return true
  if (INCOMPLETE_CONTENT_RE.test(content)) return true
  if (/\$\.\.\.\$/.test(content) || content.includes('▲') && content.length < 40) return true
  if (INCOMPLETE_ANALYSIS_RE.test(analysis)) return true

  const isChoice = q.question_type === '选择题'
    || /[A-Fa-f][\.．、\)）]\s*\S/.test(content)
    || options.length >= 2

  if (isChoice) {
    const realOpts = options.filter((o) => {
      const s = String(o).trim()
      return s.length > 3 && !EMPTY_OPTION_RE.test(s)
    })
    const extracted = extractOptionsFromContent(content)
    const realExtracted = extracted.filter((o) => !EMPTY_OPTION_RE.test(o))
    if (realOpts.length === 0 && realExtracted.length === 0) return true
    if (realOpts.length > 0 && realOpts.every((o) => o.length <= 4)) return true
  }

  return false
}

/** 补全选项：从 content 提取并写入题目对象 */
export function enrichQuestionOptions(q) {
  if (!q || typeof q !== 'object') return q
  const options = Array.isArray(q.options) ? [...q.options] : []
  const hasReal = options.some((o) => String(o).trim().length > 3 && !EMPTY_OPTION_RE.test(String(o).trim()))

  if (!hasReal) {
    const extracted = extractOptionsFromContent(q.content)
    if (extracted.length >= 2) {
      q.options = extracted
      if (q.question_type === '应用题' || !q.question_type) {
        q.question_type = '选择题'
      }
    }
  }

  // 移除纯占位选项
  if (Array.isArray(q.options)) {
    q.options = q.options.filter((o) => {
      const s = String(o).trim()
      return s.length > 3 && !EMPTY_OPTION_RE.test(s)
    })
  }

  return q
}

/** 同题号保留内容更长的一条，避免分块重复 */
export function dedupeQuestionsByNumber(questions) {
  const list = Array.isArray(questions) ? questions : []
  const byKey = new Map()

  for (const q of list) {
    const num = extractLeadingQuestionNumber(q.content) ?? q.sort_order ?? q.question_number
    const key = num != null ? `n${num}` : `sort${q.sort_order ?? byKey.size}`
    const existing = byKey.get(key)
    if (!existing) {
      byKey.set(key, q)
      continue
    }
    const score = (item) => {
      let s = String(item.content ?? '').length
      s += (Array.isArray(item.options) ? item.options.join('').length : 0) * 2
      s += String(item.analysis ?? '').length
      if (isIncompleteQuestion(item)) s -= 1000
      return s
    }
    if (score(q) > score(existing)) {
      byKey.set(key, q)
    }
  }

  return [...byKey.values()].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
}

/** 过滤并 enrich 题目列表 */
export function filterCompleteQuestions(questions) {
  const list = Array.isArray(questions) ? questions : []
  const enriched = list.map((q) => enrichQuestionOptions({ ...q }))
  const deduped = dedupeQuestionsByNumber(enriched)
  const valid = deduped.filter((q) => !isIncompleteQuestion(q))

  console.log('[questionCompleteness] 完整度过滤', {
    input: list.length,
    afterDedupe: deduped.length,
    valid: valid.length,
    rejected: deduped.length - valid.length,
  })

  return valid
}
