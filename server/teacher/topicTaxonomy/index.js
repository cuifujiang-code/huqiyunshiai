/**
 * 全学段 · 全科目专题分类引擎
 */
import { TAXONOMY_REGISTRY, FALLBACK_GROUP, FALLBACK_TAG } from './registry.js'

const JUNIOR = ['七年级', '八年级', '九年级']
const SENIOR = ['高一', '高二', '高三']

/** 解析 taxonomy registry key */
export function resolveTaxonomyKey(grade = '', subject = '') {
  if (!subject) return null
  const g = String(grade || '').trim()

  if (subject === '数学') {
    if (JUNIOR.includes(g)) return `${g}|数学`
    if (SENIOR.includes(g)) return `${g}|数学`
    if (!g) return '高三|数学'
    return SENIOR.includes(g) ? `${g}|数学` : '高三|数学'
  }

  if (subject === '物理') {
    if (g === '八年级') return '八年级|物理'
    if (g === '九年级') return '九年级|物理'
    if (SENIOR.includes(g) || !g) return '高中|物理'
    return null
  }

  if (subject === '化学') {
    if (g === '九年级') return '九年级|化学'
    if (SENIOR.includes(g) || !g) return '高中|化学'
    return null
  }

  if (subject === '历史') {
    if (g === '七年级') return '七年级|历史'
    if (g === '八年级') return '八年级|历史'
    if (g === '九年级') return '九年级|历史'
    if (SENIOR.includes(g) || !g) return '高中|历史'
    return '九年级|历史'
  }

  if (subject === '地理') {
    if (g === '七年级') return '七年级|地理'
    if (g === '八年级') return '八年级|地理'
    if (SENIOR.includes(g) || !g) return '高中|地理'
    return '八年级|地理'
  }

  if (JUNIOR.includes(g) && ['语文', '英语'].includes(subject)) return `初中|${subject}`
  if ((SENIOR.includes(g) || !g) && ['语文', '英语', '生物'].includes(subject)) return `高中|${subject}`

  if (SENIOR.includes(g)) return `高中|${subject}`
  if (JUNIOR.includes(g)) return `初中|${subject}`
  return `高中|${subject}`
}

export function hasTopicTaxonomy(grade, subject) {
  const key = resolveTaxonomyKey(grade, subject)
  return Boolean(key && TAXONOMY_REGISTRY[key])
}

export function getTopicTaxonomy(grade, subject) {
  const key = resolveTaxonomyKey(grade, subject)
  if (!key || !TAXONOMY_REGISTRY[key]) return []
  return TAXONOMY_REGISTRY[key]
}

function buildKeywordMap(taxonomy) {
  const map = {}
  for (const { group, tags } of taxonomy) {
    for (const tag of tags) {
      const kws = new Set([tag, group])
      tag.split(/[与及、,，/\s（）()]+/).filter((s) => s.length >= 2).forEach((s) => kws.add(s))
      group.split(/[与及、,，/\s（）()]+/).filter((s) => s.length >= 2).forEach((s) => kws.add(s))
      map[tag] = [...kws]
    }
  }
  return map
}

const keywordCache = new Map()

function getKeywordsForKey(key) {
  if (!keywordCache.has(key)) {
    keywordCache.set(key, buildKeywordMap(TAXONOMY_REGISTRY[key] || []))
  }
  return keywordCache.get(key)
}

function getAllTagsForKey(key) {
  const tax = TAXONOMY_REGISTRY[key] || []
  return new Set(tax.flatMap((g) => g.tags))
}

function getTagToGroupForKey(key) {
  const map = new Map()
  for (const { group, tags } of TAXONOMY_REGISTRY[key] || []) {
    for (const tag of tags) map.set(tag, group)
  }
  return map
}

function collectSearchText(knowledgePoint = '', tags = [], content = '', analysis = '') {
  const tagStr = Array.isArray(tags) ? tags.join(' ') : ''
  return `${knowledgePoint} ${tagStr} ${content} ${analysis}`.toLowerCase()
}

/** 匹配题目到二级考点 */
export function matchQuestionToTopic(grade, subject, knowledgePoint = '', tags = [], content = '', analysis = '') {
  const key = resolveTaxonomyKey(grade, subject)
  if (!key || !TAXONOMY_REGISTRY[key]) return null

  const allTags = getAllTagsForKey(key)
  const tagToGroup = getTagToGroupForKey(key)
  const directTag = (Array.isArray(tags) ? tags : []).find((t) => allTags.has(t))
  if (directTag) {
    return { group: tagToGroup.get(directTag), tag: directTag, taxonomyKey: key }
  }

  const keywords = getKeywordsForKey(key)
  const text = collectSearchText(knowledgePoint, tags, content, analysis)
  let best = null
  let bestScore = 0
  for (const [tag, kws] of Object.entries(keywords)) {
    if (tag === FALLBACK_TAG) continue
    let score = 0
    for (const kw of kws) {
      if (text.includes(String(kw).toLowerCase())) score += String(kw).length
    }
    if (text.includes(tag.toLowerCase())) score += tag.length * 2
    if (score > bestScore) {
      bestScore = score
      best = tag
    }
  }
  if (best && bestScore > 0) {
    return { group: tagToGroup.get(best), tag: best, taxonomyKey: key }
  }
  return null
}

export function normalizeTopicTags(tags = [], topicTag = '', grade = '', subject = '') {
  const key = resolveTaxonomyKey(grade, subject)
  const allTags = key ? getAllTagsForKey(key) : new Set()
  const standardFromInput = (Array.isArray(tags) ? tags : []).filter((t) => allTags.has(t))
  const cleaned = (Array.isArray(tags) ? tags : []).filter((t) => !allTags.has(t) && !isLegacyNoiseTag(t))
  if (topicTag && allTags.has(topicTag) && !standardFromInput.includes(topicTag)) {
    return [topicTag, ...standardFromInput, ...cleaned.slice(0, 3)]
  }
  if (standardFromInput.length) return [...standardFromInput, ...cleaned.slice(0, 3)]
  if (topicTag && allTags.has(topicTag)) return [topicTag, ...cleaned.slice(0, 3)]
  return cleaned.slice(0, 5)
}

const LEGACY_NOISE = new Set(['几何', '光电效应', '含公式占位符', '含图片占位符', '未分类'])

function isLegacyNoiseTag(tag) {
  return LEGACY_NOISE.has(tag) || /^标签/.test(tag)
}

export function resolveQuestionTopic(row = {}) {
  const key = resolveTaxonomyKey(row.grade, row.subject)
  let topicTag = row.topic_tag
  let topicGroup = row.topic_group

  if (key) {
    const allTags = getAllTagsForKey(key)
    const tagToGroup = getTagToGroupForKey(key)
    if (!topicTag || !allTags.has(topicTag)) {
      const m = matchQuestionToTopic(
        row.grade,
        row.subject,
        row.knowledge_point,
        row.tags,
        row.content,
        row.analysis,
      )
      topicTag = m?.tag || ''
      topicGroup = m?.group || topicGroup || ''
    }
    if (topicTag && tagToGroup.has(topicTag)) {
      topicGroup = tagToGroup.get(topicTag)
    }
  }
  return { topicTag: topicTag || '', topicGroup: topicGroup || '', taxonomyKey: key }
}

export function questionMatchesTopicFilter(row, { topic_tag, topic_group } = {}) {
  const { topicTag, topicGroup } = resolveQuestionTopic(row)
  if (topic_tag && topicTag !== topic_tag) return false
  if (topic_group && topicGroup !== topic_group) return false
  return true
}

/** 写入/更新题目前 enrich 专题字段 */
export function enrichTopicFields(payload = {}) {
  const { subject = '', grade = '' } = payload
  const key = resolveTaxonomyKey(grade, subject)

  if (!key || !TAXONOMY_REGISTRY[key]) {
    return {
      ...payload,
      topic_group: '',
      topic_tag: '',
      tags: (payload.tags ?? []).filter((t) => !isLegacyNoiseTag(t)),
    }
  }

  const allTags = getAllTagsForKey(key)
  const tagToGroup = getTagToGroupForKey(key)
  const explicitTag = payload.topic_tag && allTags.has(payload.topic_tag) ? payload.topic_tag : ''
  const matched = explicitTag
    ? { group: tagToGroup.get(explicitTag), tag: explicitTag }
    : matchQuestionToTopic(
      grade,
      subject,
      payload.knowledge_point,
      payload.tags,
      payload.content,
      payload.analysis,
    )

  let topic_tag = explicitTag || matched?.tag || ''
  let topic_group = (payload.topic_group && TAXONOMY_REGISTRY[key].some((g) => g.group === payload.topic_group))
    ? payload.topic_group
    : (matched?.group || tagToGroup.get(topic_tag) || '')

  if (!topic_tag) {
    topic_tag = FALLBACK_TAG
    topic_group = FALLBACK_GROUP
  }

  return {
    ...payload,
    topic_group,
    topic_tag,
    tags: normalizeTopicTags(payload.tags, topic_tag, grade, subject),
  }
}

function mergeTaxonomyForSubject(subject) {
  const merged = new Map()
  for (const [key, taxonomy] of Object.entries(TAXONOMY_REGISTRY)) {
    if (!key.endsWith(`|${subject}`)) continue
    for (const { group, tags } of taxonomy) {
      if (!merged.has(group)) merged.set(group, new Set())
      tags.forEach((t) => merged.get(group).add(t))
    }
  }
  return [...merged.entries()].map(([group, tagSet]) => ({ group, tags: [...tagSet] }))
}

function seedGroupMap(taxonomy) {
  const groupMap = new Map()
  for (const { group, tags } of taxonomy) {
    groupMap.set(group, {
      group,
      count: 0,
      tags: tags.map((tag) => ({ tag, count: 0 })),
    })
  }
  return groupMap
}

export function buildGroupedTopicStats(rows = [], grade = '', subject = '') {
  let taxonomy = []
  if (grade && subject) {
    taxonomy = getTopicTaxonomy(grade, subject)
  } else if (subject) {
    taxonomy = mergeTaxonomyForSubject(subject)
  }
  if (!taxonomy.length) return []

  const groupMap = seedGroupMap(taxonomy)

  for (const row of rows) {
    const { topicTag, topicGroup } = resolveQuestionTopic(row)
    if (!topicTag || !topicGroup || !groupMap.has(topicGroup)) continue
    const bucket = groupMap.get(topicGroup)
    let tagEntry = bucket.tags.find((t) => t.tag === topicTag)
    if (!tagEntry) {
      tagEntry = { tag: topicTag, count: 0 }
      bucket.tags.push(tagEntry)
    }
    bucket.count += 1
    tagEntry.count += 1
  }

  return [...groupMap.values()]
    .map((g) => ({
      ...g,
      tags: g.tags.filter((t) => t.count > 0).sort((a, b) => b.count - a.count),
    }))
    .filter((g) => g.count > 0)
    .sort((a, b) => b.count - a.count)
}

export function batchEnrichQuestions(questions = [], options = {}) {
  const onProgress = options.onProgress || (() => {})
  let matched = 0
  let fallback = 0
  const enriched = questions.map((q, i) => {
    const before = q.topic_tag
    const result = enrichTopicFields(q)
    if (result.topic_tag && result.topic_tag !== FALLBACK_TAG) matched += 1
    else fallback += 1
    onProgress(i + 1, questions.length, result)
    return result
  })
  return { items: enriched, matched, fallback, total: questions.length }
}

export function getTaxonomyForDisplay(grade, subject) {
  return getTopicTaxonomy(grade, subject)
}

/** 根据知识点/题干推断高中数学年级（用于批量导入重分类） */
export function inferMathGrade(row = {}) {
  const grades = ['高一', '高二', '高三']
  const text = collectSearchText(row.knowledge_point, row.tags, row.content, row.analysis)

  let bestGrade = grades.includes(String(row.grade || '').trim()) ? row.grade.trim() : '高二'
  let bestScore = 0

  for (const g of grades) {
    const key = `${g}|数学`
    if (!TAXONOMY_REGISTRY[key]) continue
    const keywords = getKeywordsForKey(key)
    let score = 0
    for (const [tag, kws] of Object.entries(keywords)) {
      if (tag === FALLBACK_TAG) continue
      for (const kw of kws) {
        const k = String(kw).toLowerCase()
        if (k.length >= 2 && text.includes(k)) score += k.length
      }
      if (text.includes(tag.toLowerCase())) score += tag.length * 2
    }
    if (score > bestScore) {
      bestScore = score
      bestGrade = g
    }
  }

  if (bestScore === 0) {
    if (/圆锥曲线|椭圆|双曲线|抛物线|导数|数列|等差|等比|递推|立体几何|空间向量|排列|组合|二项式|条件概率|回归/.test(text)) {
      return '高二'
    }
    if (/集合|不等式|充要|对数|指数函数|任意角|平面向量|正弦定理|余弦定理|解三角形|复数/.test(text)) {
      return '高一'
    }
    if (/压轴|选考|极坐标|参数方程|综合大题|高考/.test(text)) {
      return '高三'
    }
  }
  return bestGrade
}

/** 按科目推断年级（当前支持高中数学） */
export function inferGradeForQuestion(row = {}) {
  const subject = String(row.subject || '').trim()
  const grade = String(row.grade || '').trim()
  if (JUNIOR.includes(grade)) return grade
  if (subject === '数学' && (SENIOR.includes(grade) || !grade)) {
    return inferMathGrade(row)
  }
  return grade || row.grade || ''
}

export { TAXONOMY_REGISTRY, FALLBACK_GROUP, FALLBACK_TAG }
