/**
 * 专业解读知识库 — 匹配 major-profiles.json
 */
import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROFILE_PATH = join(__dirname, '..', 'knowledge-base', 'volunteer-filling', 'major-profiles.json')

let cache = null

function loadProfiles() {
  if (cache) return cache
  if (!existsSync(PROFILE_PATH)) {
    cache = { profiles: [], tierGuide: {}, gradientGuide: {} }
    return cache
  }
  cache = JSON.parse(readFileSync(PROFILE_PATH, 'utf-8'))
  return cache
}

/** 意向专业关键词扩展（E6 同义词） */
export function expandIntentKeywords(intendedMajors) {
  const { intentAliases } = loadProfiles()
  const expanded = new Set()
  for (const m of intendedMajors || []) {
    const key = String(m).trim()
    if (!key) continue
    expanded.add(key.toLowerCase())
    const aliases = intentAliases?.[key] ?? intentAliases?.[key.toLowerCase()]
    if (aliases) {
      for (const a of aliases) expanded.add(String(a).toLowerCase())
    }
  }
  return [...expanded]
}

/** 判断专业名是否匹配意向关键词（含同义词扩展） */
export function matchesIntendedMajor(majorName, intendedMajors) {
  if (!intendedMajors?.length) return true
  const keywords = expandIntentKeywords(intendedMajors)
  const major = String(majorName || '').toLowerCase()
  return keywords.some((kw) => major.includes(kw))
}

/** 按专业名称关键词匹配解读 */
export function matchMajorProfile(majorName) {
  const { profiles } = loadProfiles()
  const name = String(majorName || '').toLowerCase()
  for (const p of profiles) {
    if (p.keywords?.some((kw) => name.includes(String(kw).toLowerCase()))) {
      return {
        majorIntro: p.majorIntro,
        employment: p.employment,
        curriculum: p.curriculum ?? [],
        careerPaths: p.careerPaths ?? [],
      }
    }
  }
  return {
    majorIntro: `${majorName}：请参考院校招生简章了解培养方案与学科特色。`,
    employment: '就业方向与院校层次、地域及个人能力相关，建议查阅该校就业质量报告。',
    curriculum: ['公共基础课', '专业核心课', '实践实训', '毕业设计/论文'],
    careerPaths: ['对口行业技术/管理岗位', '继续深造', '公务员/事业单位'],
  }
}

export function getTierGuide(tierLabel) {
  const { tierGuide } = loadProfiles()
  return tierGuide?.[tierLabel] ?? ''
}

export function getGradientGuide(gradientLevel) {
  const { gradientGuide } = loadProfiles()
  return gradientGuide?.[gradientLevel] ?? ''
}

/** 构建冲稳保策略说明 */
export function buildTierStrategySummary(items) {
  const byTier = { 冲: [], 稳: [], 保: [] }
  for (const item of items) {
    byTier[item.tierLabel]?.push(item)
  }
  return {
    冲: {
      count: byTier.冲.length,
      guide: getTierGuide('冲'),
      avgProbability: avg(byTier.冲.map((i) => i.probability)),
    },
    稳: {
      count: byTier.稳.length,
      guide: getTierGuide('稳'),
      avgProbability: avg(byTier.稳.map((i) => i.probability)),
    },
    保: {
      count: byTier.保.length,
      guide: getTierGuide('保'),
      avgProbability: avg(byTier.保.map((i) => i.probability)),
    },
  }
}

function avg(nums) {
  const valid = nums.filter((n) => n != null && !Number.isNaN(n))
  if (!valid.length) return null
  return Math.round((valid.reduce((a, b) => a + b, 0) / valid.length) * 10000) / 10000
}
