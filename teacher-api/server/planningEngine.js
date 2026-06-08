/**
 * 数据驱动教育规划引擎
 * - 加载 planning-templates.json（24h 内存缓存）
 * - 院校 aliases 匹配
 * - 注入录取数据至 DeepSeek Prompt
 * - 后处理校验数据来源引用
 */
import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { callDeepSeekWithTimeout, isDeepSeekAvailable } from './aiProviders.js'
import { extractJson } from './deepseekClient.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const TEMPLATE_PATH = join(__dirname, '..', 'knowledge-base', 'education-planning', 'planning-templates.json')
const CACHE_TTL_MS = 24 * 60 * 60 * 1000

let templateCache = { data: null, loadedAt: 0 }

const PLAN_OUTPUT_SCHEMA = `{
  "title": "规划标题",
  "generatedAt": "ISO8601",
  "dataSourceCitations": ["必须包含的数据来源引用字符串"],
  "targetUniversity": "目标院校",
  "targetMajor": "目标专业",
  "scoreGapAnalysis": { "currentEstimate": 0, "targetMinScore": 0, "gap": 0, "gapBand": "reachable|challenging|critical|comfortable" },
  "fiveStagePlan": [
    { "stage": 1, "name": "阶段名", "period": "时间段", "objectives": [], "coreTasks": [], "deliverables": [], "calibrationCheckpoint": "" }
  ],
  "studentProfile": { "name": "", "grade": "", "scoreLevel": "", "goalDirections": [], "interests": [], "parentExpectations": "", "specialNotes": "" },
  "abilityDimensions": [{ "label": "逻辑思维", "score": 80 }],
  "stageGoals": [{ "period": "", "phase": "", "coreTasks": [], "expectedOutcomes": [] }],
  "subjectPaths": [{ "subject": "", "importance": 5, "timePercent": 20, "keyKnowledgePoints": [], "resourceTypes": [] }],
  "phaseTasks": [{ "phase": "", "tasks": [{ "name": "", "criteria": "", "duration": "", "knowledgePoints": [], "relatedExercises": [] }] }],
  "milestones": [{ "date": "", "event": "", "preparationAdvice": "" }],
  "risks": [{ "risk": "", "impact": "高|中|低", "mitigation": "" }],
  "volunteerGuidance": [],
  "dynamicCalibrationNotes": ""
}`

function loadTemplates(force = false) {
  const now = Date.now()
  if (!force && templateCache.data && now - templateCache.loadedAt < CACHE_TTL_MS) {
    return templateCache.data
  }
  if (!existsSync(TEMPLATE_PATH)) {
    throw new Error(`规划模板文件不存在: ${TEMPLATE_PATH}`)
  }
  const raw = readFileSync(TEMPLATE_PATH, 'utf-8')
  templateCache = { data: JSON.parse(raw), loadedAt: now }
  console.log('[planningEngine] 已加载 planning-templates.json', { path: TEMPLATE_PATH })
  return templateCache.data
}

function normalizeName(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[（(].*?[）)]/g, '')
    .replace(/大学$/g, '大学')
}

function matchUniversity(targetUniversity) {
  const templates = loadTemplates()
  const query = normalizeName(targetUniversity)
  if (!query) return null

  for (const uni of templates.universities ?? []) {
    const names = [uni.name, ...(uni.aliases ?? [])]
    for (const n of names) {
      const norm = normalizeName(n)
      if (norm === query || norm.includes(query) || query.includes(norm)) {
        return uni
      }
    }
  }
  return null
}

function resolveMajorRecord(provinceData, major) {
  if (!provinceData?.majors) return null
  const majors = provinceData.majors
  const key = String(major || '').trim()
  if (key && majors[key]) return { majorKey: key, record: majors[key] }
  if (majors['通用']) return { majorKey: '通用', record: majors['通用'] }
  const firstKey = Object.keys(majors)[0]
  return firstKey ? { majorKey: firstKey, record: majors[firstKey] } : null
}

/**
 * 检索目标院校录取数据（供前端确认）
 */
export function lookupTargetUniversity(targetUniversity, province, major = '通用') {
  const templates = loadTemplates()
  const uni = matchUniversity(targetUniversity)
  if (!uni) {
    return {
      matched: false,
      message: templates.empty_data_rule?.message,
      emptyDataRule: templates.empty_data_rule,
    }
  }

  const prov = String(province || '').trim()
  const provinceData = uni.admission_by_province?.[prov]
  if (!provinceData) {
    return {
      matched: false,
      university: uni.name,
      message: `知识库已收录「${uni.name}」，但暂无「${prov || '未指定省份'}」的录取数据。${templates.empty_data_rule?.message ?? ''}`,
      emptyDataRule: templates.empty_data_rule,
    }
  }

  const majorHit = resolveMajorRecord(provinceData, major)
  if (!majorHit) {
    return {
      matched: false,
      university: uni.name,
      province: prov,
      message: templates.empty_data_rule?.message,
      emptyDataRule: templates.empty_data_rule,
    }
  }

  const citation = (templates.citation_format || '数据来源：{source}')
    .replace('{source}', provinceData.source || '知识库')
    .replace('{year}', String(provinceData.year || ''))
    .replace('{province}', prov)
    .replace('{university}', uni.name)
    .replace('{major}', majorHit.majorKey)

  return {
    matched: true,
    university: uni.name,
    aliases: uni.aliases,
    tier: uni.tier,
    province: prov,
    major: majorHit.majorKey,
    year: provinceData.year,
    admission: majorHit.record,
    source: provinceData.source,
    citation,
    fiveStageFramework: templates.five_stage_framework,
    dynamicCalibrationRule: templates.dynamic_calibration_rule,
  }
}

function computeGapBand(gap, templates) {
  const bands = templates.dynamic_calibration_rule?.score_gap_bands ?? []
  const absGap = Math.abs(gap)
  for (const b of bands) {
    if (b.max_score_gap != null && absGap >= b.min_score_gap && absGap < b.max_score_gap) return b
    if (b.max_score_gap == null && b.min_score_gap != null && absGap >= b.min_score_gap) return b
  }
  return bands.find((b) => b.band === 'reachable') ?? null
}

function buildCitation(templates, lookup) {
  return (templates.citation_format || '数据来源：{source}')
    .replace('{source}', lookup.source || '知识库')
    .replace('{year}', String(lookup.year || ''))
    .replace('{province}', lookup.province || '')
    .replace('{university}', lookup.university || '')
    .replace('{major}', lookup.major || '')
}

function ensureDataSourceCitations(report, mandatoryCitation) {
  const next = { ...report }
  let citations = Array.isArray(next.dataSourceCitations) ? [...next.dataSourceCitations] : []

  const hasMandatory = citations.some((c) => String(c).includes(mandatoryCitation) || mandatoryCitation.includes(String(c)))
  if (!hasMandatory) {
    citations.unshift(mandatoryCitation)
  }

  const bodyStr = JSON.stringify(next)
  if (!bodyStr.includes('数据来源') && !bodyStr.includes(mandatoryCitation.slice(0, 8))) {
    next.specialNotes = `${next.studentProfile?.specialNotes || ''}\n${mandatoryCitation}`.trim()
    if (next.studentProfile) {
      next.studentProfile = {
        ...next.studentProfile,
        specialNotes: `${next.studentProfile.specialNotes || ''}\n${mandatoryCitation}`.trim(),
      }
    }
  }

  next.dataSourceCitations = citations
  if (!next.dataProvenance) {
    next.dataProvenance = {
      engine: 'planningEngine',
      version: loadTemplates().version,
      citations,
    }
  }
  return next
}

function mapFiveStages(templates, lookup, gapBand) {
  const stages = templates.five_stage_framework?.stages ?? []
  const multiplier = gapBand?.stage_intensity_multiplier ?? 1
  return stages.map((s) => ({
    stage: s.stage,
    name: s.name,
    period: s.period_label,
    durationWeeks: Math.round((s.duration_weeks || 4) * multiplier),
    objectives: s.objectives ?? [],
    coreTasks: [
      ...(s.core_tasks ?? []),
      ...(gapBand?.add_task ? [gapBand.add_task] : []),
    ],
    deliverables: s.deliverables ?? [],
    calibrationCheckpoint: s.calibration_checkpoint ?? '',
  }))
}

function extractParams(form = {}) {
  const enhanced = form._enhanced ?? form.enhanced ?? {}
  const targetUniversity =
    form.targetUniversity ||
    enhanced.targetSchools?.[0] ||
    form.targetSchools?.[0] ||
    enhanced.targetUniversity ||
    ''
  const province =
    form.province ||
    enhanced.schoolInfo?.province ||
    form.schoolInfo?.province ||
    ''
  const major =
    form.targetMajor ||
    enhanced.targetMajor ||
    form.targetMajor ||
    '通用'
  return { targetUniversity, province, major, form, enhanced }
}

/**
 * 数据驱动规划生成主入口
 * @param {string} targetUniversity
 * @param {string} province
 * @param {string} major
 * @param {object} [formContext] 完整表单（含学生信息、成绩等）
 */
export async function generateDataDrivenPlan(targetUniversity, province, major, formContext = {}) {
  const templates = loadTemplates()
  const lookup = lookupTargetUniversity(targetUniversity, province, major)

  if (!lookup.matched) {
    return {
      success: false,
      error: 'EMPTY_DATA',
      message: lookup.message || templates.empty_data_rule?.message,
      emptyDataRule: templates.empty_data_rule,
      forbidAiHallucination: templates.empty_data_rule?.forbid_ai_hallucination ?? true,
    }
  }

  if (!isDeepSeekAvailable()) {
    return {
      success: false,
      error: 'AI_UNAVAILABLE',
      message: 'DeepSeek API 未配置，无法生成数据驱动规划',
    }
  }

  const citation = buildCitation(templates, lookup)
  const { form, enhanced } = extractParams(formContext)
  const studentName = form.studentName || enhanced.studentName || '学生'
  const grade = form.grade || enhanced.schoolInfo?.grade || ''
  const currentScore = enhanced.scoreAnalysis?.subjectInsights?.length
    ? enhanced.subjectScores?.reduce((sum, s) => sum + (s.score || 0), 0)
    : null
  const targetMin = lookup.admission?.min_score ?? 0
  const gap = currentScore != null ? targetMin - currentScore : null
  const gapBand = gap != null ? computeGapBand(gap, templates) : null
  const fiveStagePlan = mapFiveStages(templates, lookup, gapBand)

  const systemPrompt = `你是华祺云师AI数据驱动升学规划专家。
【硬性规则】
1. 必须严格基于用户提供的院校录取数据生成规划，禁止编造分数线、位次、招生计划。
2. 输出 JSON 必须包含 dataSourceCitations 数组，且至少一条与给定 citation 一致。
3. fiveStagePlan 必须包含完整的 5 个阶段，与知识库五阶段框架对应。
4. 必须引用 dynamic_calibration_rule 中的策略调整规划强度。
5. 只输出合法 JSON，不要 markdown 代码块。`

  const userPrompt = `【权威录取数据 — 不可篡改】
院校：${lookup.university}
省份：${lookup.province}
专业：${lookup.major}
年份：${lookup.year}
最低分：${lookup.admission?.min_score ?? '—'}
最低位次：${lookup.admission?.min_rank ?? '—'}
选科要求：${lookup.admission?.elective_requirement ?? '—'}
数据引用：${citation}

【动态校准】
${gap != null ? `当前估算总分约 ${currentScore}，与目标线差距 ${gap} 分，档位：${gapBand?.label ?? '待评估'}` : '暂无总分，请基于成绩水平估算'}
校准策略：${gapBand?.strategy ?? templates.dynamic_calibration_rule?.description}

【五阶段框架】
${JSON.stringify(fiveStagePlan, null, 2)}

【学生表单】
${JSON.stringify({ ...form, _enhanced: enhanced }, null, 2)}

请生成完整规划 JSON，结构：
${PLAN_OUTPUT_SCHEMA}`

  const aiResult = await callDeepSeekWithTimeout(systemPrompt, userPrompt, {
    label: 'PlanningEngine-DeepSeek',
    temperature: 0.35,
    maxTokens: 8000,
  })

  let parsed
  try {
    parsed = JSON.parse(extractJson(aiResult))
  } catch (err) {
    return {
      success: false,
      error: 'PARSE_FAILED',
      message: `AI 返回格式解析失败: ${err instanceof Error ? err.message : String(err)}`,
      raw: String(aiResult).slice(0, 500),
    }
  }

  parsed.fiveStagePlan = parsed.fiveStagePlan?.length >= 5 ? parsed.fiveStagePlan : fiveStagePlan
  parsed.targetUniversity = lookup.university
  parsed.targetMajor = lookup.major
  parsed.dataSourceCitations = parsed.dataSourceCitations ?? []
  parsed = ensureDataSourceCitations(parsed, citation)

  if (!parsed.scoreGapAnalysis && gap != null) {
    parsed.scoreGapAnalysis = {
      currentEstimate: currentScore,
      targetMinScore: targetMin,
      gap,
      gapBand: gapBand?.band ?? 'unknown',
    }
  }

  parsed.dynamicCalibrationNotes = parsed.dynamicCalibrationNotes || gapBand?.strategy || ''
  parsed.source = 'ai-data-driven'
  parsed.generatedAt = parsed.generatedAt || new Date().toISOString()

  return {
    success: true,
    report: parsed,
    lookup,
    citation,
    fiveStagePlan,
    gapBand,
    meta: {
      engine: 'planningEngine',
      templateVersion: templates.version,
      providersUsed: ['DeepSeek-planningEngine'],
    },
  }
}

/** 强制刷新模板缓存（管理/测试用） */
export function reloadPlanningTemplates() {
  return loadTemplates(true)
}

export { loadTemplates, matchUniversity }
