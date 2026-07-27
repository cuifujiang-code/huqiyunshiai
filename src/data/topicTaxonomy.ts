import { TAXONOMY_REGISTRY } from './topicTaxonomyRegistry'

export const FALLBACK_GROUP = '综合题型'
export const FALLBACK_TAG = '综合题型'

const JUNIOR = ['七年级', '八年级', '九年级']
const SENIOR = ['高一', '高二', '高三']

export function resolveTaxonomyKey(grade = '', subject = ''): string | null {
  if (!subject) return null
  const g = String(grade || '').trim()

  if (subject === '数学') {
    if (JUNIOR.includes(g)) return `${g}|数学`
    if (SENIOR.includes(g)) return `${g}|数学`
    return '高三|数学'
  }
  if (subject === '物理') {
    if (g === '八年级') return '八年级|物理'
    if (g === '九年级') return '九年级|物理'
    return '高中|物理'
  }
  if (subject === '化学') {
    if (g === '九年级') return '九年级|化学'
    return '高中|化学'
  }
  if (subject === '历史') {
    if (g === '七年级') return '七年级|历史'
    if (g === '八年级') return '八年级|历史'
    if (g === '九年级') return '九年级|历史'
    return '高中|历史'
  }
  if (subject === '地理') {
    if (g === '七年级') return '七年级|地理'
    if (g === '八年级') return '八年级|地理'
    return '高中|地理'
  }
  if (JUNIOR.includes(g) && ['语文', '英语'].includes(subject)) return `初中|${subject}`
  if ((SENIOR.includes(g) || !g) && ['语文', '英语', '生物'].includes(subject)) return `高中|${subject}`
  if (SENIOR.includes(g)) return `高中|${subject}`
  if (JUNIOR.includes(g)) return `初中|${subject}`
  return `高中|${subject}`
}

export function hasTopicTaxonomy(grade: string, subject: string): boolean {
  const key = resolveTaxonomyKey(grade, subject)
  return Boolean(key && TAXONOMY_REGISTRY[key])
}

export function defaultGradeForSubject(subject: string): string {
  if (subject === '物理') return '八年级'
  if (subject === '化学') return '九年级'
  if (subject === '历史' || subject === '地理') return '七年级'
  if (subject === '生物') return '高一'
  return '高一'
}

export function getTopicTaxonomy(grade: string, subject: string) {
  const key = resolveTaxonomyKey(grade, subject)
  if (!key || !TAXONOMY_REGISTRY[key]) return []
  return TAXONOMY_REGISTRY[key]
}

/** 将 API 分组数据与标准分类合并 */
export function mergeTopicGroups(
  apiGroups: TopicGroup[] = [],
  grade: string,
  subject: string,
): TopicGroup[] {
  const taxonomy = getTopicTaxonomy(grade, subject)
  if (!taxonomy.length) return apiGroups
  const apiMap = new Map(apiGroups.map((g) => [g.group, g]))
  return taxonomy.map(({ group, tags }) => {
    const api = apiMap.get(group)
    const tagCounts = new Map((api?.tags ?? []).map((t) => [t.tag, t.count]))
    const mergedTags = tags.map((tag) => ({
      tag,
      count: tagCounts.get(tag) ?? 0,
    }))
    const count = api?.count ?? mergedTags.reduce((s, t) => s + t.count, 0)
    return { group, count, tags: mergedTags }
  })
}

/** @deprecated 兼容旧引用 */
export const MATH_TOPIC_TAXONOMY = TAXONOMY_REGISTRY['高三|数学'] ?? []
export const mergeMathTopicGroups = (groups: TopicGroup[]) => mergeTopicGroups(groups, '高三', '数学')
