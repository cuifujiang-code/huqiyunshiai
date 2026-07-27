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
import {
  HUQI_PLANNING_SYSTEM_PROMPT,
  fetchPlanningStudentContext,
  formatPlanningStudentContextBlock,
  buildEnrichedUserPromptSections,
} from '../../server/planning/planningPrompts.js'
import {
  resolvePlanningEnrichment,
  formatExamTrendBlock,
  normalizePathOptions,
} from '../../server/planning/planningEnrichment.js'
import { buildDatabaseDrivenPlanningReport } from '../../server/planning/planningDatabaseReport.js'

const PLANNING_AI_TIMEOUT_MS = Number(process.env.PLANNING_AI_TIMEOUT_MS || 180000)

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
  "dynamicCalibrationNotes": "",
  "professionalReport": {
    "diagnosis": "现状诊断100字以内",
    "recommendedPaths": [
      { "type": "main|backup|fallback", "path": "路径名称", "reason": "匹配理由" }
    ],
    "keyTimeline": [{ "month": "精确到月", "event": "事件", "note": "说明" }],
    "actionList90Days": ["具体可执行任务，至少6条"],
    "riskAlerts": ["风险提示1-2条"]
  },
  "pathOptions": [
    {
      "name": "985冲刺路线",
      "matchScore": 88,
      "reason": "推荐理由50字以内",
      "keyActions": ["关键行动1", "关键行动2", "关键行动3"]
    }
  ]
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

/**
 * 院校层次标签列表 — 当 targetUniversity 是这些标签时，不查具体院校，改用层次估算
 */
const TIER_LABELS = [
  '985/顶尖院校', '985', '顶尖院校', 'C9', '清北',
  '211/双一流', '211', '双一流',
  '省内重点本科', '省重点', '省内重点', '重点本科',
  '普通本科', '本科', '一段线',
  '暂时没想好', '未定', '待定', '没想好',
]

function isTierLabel(str) {
  const normalized = String(str || '').trim().toLowerCase()
  if (!normalized) return false
  return TIER_LABELS.some((label) => {
    const nl = label.toLowerCase()
    return normalized === nl || normalized.includes(nl) || nl.includes(normalized)
  })
}

/**
 * 根据院校层次标签获取估算录取数据
 */
function lookupTierEstimate(tierLabel) {
  const templates = loadTemplates()
  const estimates = templates.tier_estimates?.estimates ?? []
  const query = String(tierLabel || '').trim().toLowerCase()

  for (const est of estimates) {
    const aliases = [est.tier, ...(est.aliases ?? [])]
    for (const a of aliases) {
      const na = a.toLowerCase()
      if (na === query || query.includes(na) || na.includes(query)) {
        return est
      }
    }
  }
  return null
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
 * 支持两种模式：
 * 1. 精确匹配 — 当 targetUniversity 是具体院校名时，查 universities 列表
 * 2. 层级估算 — 当 targetUniversity 是层次标签（如"211/双一流"）时，查 tier_estimates
 */
export function lookupTargetUniversity(targetUniversity, province, major = '通用') {
  const templates = loadTemplates()

  // 先检测是否为层次标签
  if (isTierLabel(targetUniversity)) {
    const tierEst = lookupTierEstimate(targetUniversity)
    if (tierEst) {
      return {
        matched: true,
        degraded: true,
        university: tierEst.tier,
        tier: tierEst.tier,
        province: String(province || '').trim() || '浙江',
        major: major || '通用',
        year: new Date().getFullYear(),
        admission: {
          min_score: tierEst.score_range.min,
          max_score: tierEst.score_range.max,
          min_rank: tierEst.rank_range.min,
          max_rank: tierEst.rank_range.max,
          elective_requirement: tierEst.elective_requirement_hint || '—',
          is_estimate: true,
          estimate_source: `基于${tierEst.tier}层次院校录取区间估算`,
        },
        source: `层级估算（${tierEst.tier}）`,
        citation: `数据来源：层级估算（${tierEst.tier}层次院校${tierEst.score_range.min}-${tierEst.score_range.max}分区间），非精确录取数据，仅供参考`,
        strategyHint: tierEst.strategy_hint,
        typicalUniversities: tierEst.typical_universities,
        fiveStageFramework: templates.five_stage_framework,
        dynamicCalibrationRule: templates.dynamic_calibration_rule,
        message: templates.empty_data_rule?.degraded_mode_message,
      }
    }
  }

  // 精确匹配具体院校
  const uni = matchUniversity(targetUniversity)
  if (!uni) {
    // 检查是否允许降级模式
    const allowDegraded = templates.empty_data_rule?.action === 'warn_and_continue'
    if (allowDegraded) {
      // 尝试根据院校名猜测层次
      const guessedTier = guessTierByName(targetUniversity)
      if (guessedTier) {
        const tierEst = lookupTierEstimate(guessedTier)
        if (tierEst) {
          return {
            matched: true,
            degraded: true,
            university: targetUniversity,
            tier: tierEst.tier,
            province: String(province || '').trim() || '浙江',
            major: major || '通用',
            year: new Date().getFullYear(),
            admission: {
              min_score: tierEst.score_range.min,
              max_score: tierEst.score_range.max,
              min_rank: tierEst.rank_range.min,
              max_rank: tierEst.rank_range.max,
              elective_requirement: tierEst.elective_requirement_hint || '—',
              is_estimate: true,
              estimate_source: `基于${tierEst.tier}层次院校录取区间估算`,
            },
            source: `层级估算（${tierEst.tier}）`,
            citation: `数据来源：层级估算（${targetUniversity}按${tierEst.tier}层次估算），非精确录取数据，仅供参考`,
            strategyHint: tierEst.strategy_hint,
            typicalUniversities: tierEst.typical_universities,
            fiveStageFramework: templates.five_stage_framework,
            dynamicCalibrationRule: templates.dynamic_calibration_rule,
            message: templates.empty_data_rule?.degraded_mode_message,
          }
        }
      }
    }

    return {
      matched: false,
      message: templates.empty_data_rule?.message,
      emptyDataRule: templates.empty_data_rule,
    }
  }

  const prov = String(province || '').trim()
  const provinceData = uni.admission_by_province?.[prov]
  if (!provinceData) {
    // 省份不匹配，也尝试降级
    const allowDegraded = templates.empty_data_rule?.action === 'warn_and_continue'
    if (allowDegraded) {
      const tierEst = lookupTierEstimate(uni.tier) || lookupTierEstimate('普通本科')
      if (tierEst) {
        return {
          matched: true,
          degraded: true,
          university: uni.name,
          tier: uni.tier || tierEst.tier,
          province: prov || '浙江',
          major: major || '通用',
          year: new Date().getFullYear(),
          admission: {
            min_score: tierEst.score_range.min,
            max_score: tierEst.score_range.max,
            min_rank: tierEst.rank_range.min,
            max_rank: tierEst.rank_range.max,
            elective_requirement: tierEst.elective_requirement_hint || '—',
            is_estimate: true,
            estimate_source: `基于${tierEst.tier}层次院校录取区间估算`,
          },
          source: `层级估算（${tierEst.tier}）`,
          citation: `数据来源：层级估算（${uni.name}按${tierEst.tier}层次估算），非精确录取数据，仅供参考`,
          strategyHint: tierEst.strategy_hint,
          fiveStageFramework: templates.five_stage_framework,
          dynamicCalibrationRule: templates.dynamic_calibration_rule,
          message: templates.empty_data_rule?.degraded_mode_message,
        }
      }
    }

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
    degraded: false,
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

/**
 * 根据院校名猜测其层次
 */
function guessTierByName(name) {
  const n = String(name || '').trim()
  if (!n) return null

  const tierKeywords = [
    { pattern: /清华|北大|北京大学|清华|复旦|上海交通|浙大|浙江大|中科|南京大|人民大|北航|北师/, tier: '985/顶尖院校' },
    { pattern: /985|C9|顶尖/, tier: '985/顶尖院校' },
    { pattern: /211|双一流|武大|武汉大|华科|华中科技|东南大|同济|厦大|厦门大|中山大|华南理工|电子科技|西安电子|北京邮|北邮|中央财经|上海财经|对外经贸/, tier: '211/双一流' },
    { pattern: /杭电|杭州电子|宁波大|浙江师范|温州医科|浙江理工|杭州师范|浙江工商|浙工大|浙江工业/, tier: '省内重点本科' },
    { pattern: /学院|文理|农林|纺织|科技学院/, tier: '普通本科' },
  ]

  for (const { pattern, tier } of tierKeywords) {
    if (pattern.test(n)) return tier
  }
  return '普通本科'
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
    // 检查是否允许降级模式
    const allowDegraded = templates.empty_data_rule?.action === 'warn_and_continue'
    if (!allowDegraded) {
      return {
        success: false,
        error: 'EMPTY_DATA',
        message: lookup.message || templates.empty_data_rule?.message,
        emptyDataRule: templates.empty_data_rule,
        forbidAiHallucination: templates.empty_data_rule?.forbid_ai_hallucination ?? true,
      }
    }
    // 如果允许降级但仍未匹配，使用最通用的估算
    const fallbackEst = lookupTierEstimate('普通本科')
    if (fallbackEst) {
      // 构建降级 lookup
      const degradedLookup = {
        matched: true,
        degraded: true,
        university: targetUniversity || '目标院校',
        tier: fallbackEst.tier,
        province: String(province || '').trim() || '浙江',
        major: major || '通用',
        year: new Date().getFullYear(),
        admission: {
          min_score: fallbackEst.score_range.min,
          max_score: fallbackEst.score_range.max,
          min_rank: fallbackEst.rank_range.min,
          max_rank: fallbackEst.rank_range.max,
          elective_requirement: fallbackEst.elective_requirement_hint || '—',
          is_estimate: true,
          estimate_source: `基于${fallbackEst.tier}层次院校录取区间估算`,
        },
        source: `层级估算（${fallbackEst.tier}）`,
        citation: `数据来源：层级估算（按${fallbackEst.tier}层次估算），非精确录取数据，仅供参考`,
        strategyHint: fallbackEst.strategy_hint,
        fiveStageFramework: templates.five_stage_framework,
        dynamicCalibrationRule: templates.dynamic_calibration_rule,
        message: templates.empty_data_rule?.degraded_mode_message,
      }
      return _generatePlanWithLookup(degradedLookup, templates, formContext, province, major)
    }

    return {
      success: false,
      error: 'EMPTY_DATA',
      message: lookup.message || templates.empty_data_rule?.message,
      emptyDataRule: templates.empty_data_rule,
      forbidAiHallucination: false,
    }
  }

  return _generatePlanWithLookup(lookup, templates, formContext, province, major)
}

/**
 * 内部函数：基于 lookup 结果生成规划（支持精确模式和降级模式）
 */
async function _generatePlanWithLookup(lookup, templates, formContext, province, major) {
  const isDegraded = !!lookup.degraded

  const citation = lookup.citation || buildCitation(templates, lookup)
  const { form, enhanced } = extractParams(formContext)
  const grade = form.grade || enhanced.schoolInfo?.grade || ''
  const currentScore = enhanced.scoreAnalysis?.subjectInsights?.length
    ? enhanced.subjectScores?.reduce((sum, s) => sum + (s.score || 0), 0)
    : null
  const targetMin = lookup.admission?.min_score ?? 0
  const gap = currentScore != null ? targetMin - currentScore : null
  const gapBand = gap != null ? computeGapBand(gap, templates) : null
  const fiveStagePlan = mapFiveStages(templates, lookup, gapBand)

  const studentUserId =
    formContext.studentUserId ||
    formContext.userId ||
    enhanced.studentUserId ||
    form.studentUserId ||
    ''
  const clientEnrichment = formContext._planningEnrichment || null
  const hollandOverride = clientEnrichment?.hollandScores || form.hollandScores || enhanced.hollandScores
  const studentContext = await fetchPlanningStudentContext(studentUserId, {
    hollandScores: hollandOverride,
  })
  const studentContextBlock = formatPlanningStudentContextBlock(studentContext)
  const planningEnrichment = resolvePlanningEnrichment(form, enhanced, clientEnrichment)
  const examTrendBlock = formatExamTrendBlock(studentContext.recentExamRecords ?? [])

  const dbReportCtx = {
    lookup,
    templates,
    form,
    enhanced,
    planningEnrichment,
    studentContext,
    fiveStagePlan,
    gapBand,
    citation,
    isDegraded,
  }

  const finishReport = (parsed, providersUsed, sourceTag) => {
    parsed.fiveStagePlan = parsed.fiveStagePlan?.length >= 5 ? parsed.fiveStagePlan : fiveStagePlan
    parsed.targetUniversity = lookup.university
    parsed.targetMajor = lookup.major || form.targetMajorIntent || major
    parsed.dataSourceCitations = parsed.dataSourceCitations ?? []
    let report = ensureDataSourceCitations(parsed, citation)

    if (isDegraded) {
      report.degradedMode = true
      report.degradedWarning = lookup.message || templates.empty_data_rule?.degraded_mode_message
      if (!report.dataSourceCitations.some((c) => c.includes('估算'))) {
        report.dataSourceCitations.push(
          '注意：部分录取数据为层级估算值，非精确数据，志愿填报时请以教育考试院公布数据为准',
        )
      }
    }

    if (!report.scoreGapAnalysis && gap != null) {
      report.scoreGapAnalysis = {
        currentEstimate: currentScore,
        targetMinScore: targetMin,
        gap,
        gapBand: gapBand?.band ?? 'unknown',
      }
    }

    report.dynamicCalibrationNotes = report.dynamicCalibrationNotes || gapBand?.strategy || ''
    report.generatedAt = report.generatedAt || new Date().toISOString()

    const fiveDimTotal = planningEnrichment.fiveDimension?.totalScore ?? form.competencyScore ?? 60
    report.pathOptions = normalizePathOptions(report, fiveDimTotal, { ...form, ...enhanced })

    if (planningEnrichment.fiveDimension) {
      report.abilityDimensions = [
        { label: '学科成绩', score: planningEnrichment.fiveDimension.academicScore },
        { label: '综合能力', score: planningEnrichment.fiveDimension.abilityScore },
        { label: '兴趣匹配', score: planningEnrichment.fiveDimension.interestScore },
        { label: '家庭资源', score: planningEnrichment.fiveDimension.resourceScore },
        { label: '目标期望', score: planningEnrichment.fiveDimension.targetScore },
      ]
    }

    report.source = sourceTag

    return {
      success: true,
      report,
      lookup,
      citation,
      fiveStagePlan,
      gapBand,
      isDegraded,
      meta: {
        engine: 'planningEngine',
        templateVersion: templates.version,
        providersUsed,
        degradedMode: isDegraded,
        dataSources: [
          'planning-templates.json',
          studentUserId ? 'supabase:profiles,exam_records' : null,
          clientEnrichment ? 'form:planningEnrichment' : null,
        ].filter(Boolean),
      },
    }
  }

  // 优先 DeepSeek；失败或未配置则使用数据库 + 知识库结构化报告
  if (isDeepSeekAvailable()) {
    try {
      const enrichedFormSection = buildEnrichedUserPromptSections(
        form,
        enhanced,
        studentContextBlock,
        planningEnrichment,
        examTrendBlock,
      )

      const degradedWarning = isDegraded
        ? `
【⚠️ 降级模式提示】
当前目标「${lookup.university}」采用层级估算录取区间。
${lookup.message || ''}
`
        : ''

      const systemPrompt = `${HUQI_PLANNING_SYSTEM_PROMPT}
${degradedWarning}
【JSON 映射要求】
- professionalReport 五大模块 + pathOptions 三条路径`

      const admissionDataBlock = isDegraded
        ? `层次：${lookup.university}（${lookup.tier || '估算'}）
分数区间：${lookup.admission?.min_score ?? '—'} ~ ${lookup.admission?.max_score ?? '—'}`
        : `院校：${lookup.university}
最低分：${lookup.admission?.min_score ?? '—'}`

      const userPrompt = `【录取数据】
${admissionDataBlock}
数据引用：${citation}

${enrichedFormSection}

请生成完整规划 JSON，结构：
${PLAN_OUTPUT_SCHEMA}`

      const aiResult = await callDeepSeekWithTimeout(systemPrompt, userPrompt, {
        label: 'PlanningEngine-DeepSeek',
        temperature: 0.35,
        maxTokens: 8000,
        timeoutMs: PLANNING_AI_TIMEOUT_MS,
      })

      const parsed = JSON.parse(extractJson(aiResult))
      return finishReport(parsed, ['DeepSeek-planningEngine'], isDegraded ? 'ai-data-driven-degraded' : 'ai-data-driven')
    } catch (err) {
      console.warn('[planningEngine] AI 生成失败，降级为数据库驱动', err instanceof Error ? err.message : err)
    }
  } else {
    console.warn('[planningEngine] DeepSeek 未配置，使用数据库驱动报告')
  }

  const dbReport = buildDatabaseDrivenPlanningReport(dbReportCtx)
  return finishReport(dbReport, ['database-driven'], dbReport.source)
}

/** 强制刷新模板缓存（管理/测试用） */
export function reloadPlanningTemplates() {
  return loadTemplates(true)
}

export { loadTemplates, matchUniversity, isTierLabel, lookupTierEstimate }
