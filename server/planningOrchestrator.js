import { callDeepSeekAI, extractJson, serializeError } from './deepseekClient.js'
import { buildKnowledgeSystemPrompt } from './knowledgeBase.js'
import { buildMockPlanningReport } from './mockPlanningData.js'
import { buildPlanningContext, formatContextForPrompt } from './planningContextBuilder.js'
import { normalizeReport } from './planningGenerator.js'

const MOCK_FALLBACK_MESSAGE = 'AI服务暂不可用，已展示示例教育规划方案'

async function callRole(system, user, label) {
  const content = await callDeepSeekAI(system, user)
  return { label, content, parsed: safeParseJson(content) }
}

function safeParseJson(raw) {
  try {
    return JSON.parse(extractJson(raw))
  } catch {
    return { text: String(raw || '').slice(0, 2000) }
  }
}

const EXTENDED_SCHEMA = `在原有 JSON 基础上增加：
"scoreAnalysis": { "summary": "基于真实历次成绩的分析", "weakSubjects": [], "strongSubjects": [] },
"examTimeline": [{ "month": "时间", "event": "事件", "note": "说明" }],
"volunteerGuidance": ["志愿策略1"],
"electiveAdvice": [{ "subject": "选考科目", "advice": "建议" }],
"studentProfile": { ..., "academicTerm": "学期", "electiveSubjects": [], "examSystemNote": "省份考试制度" }`

/**
 * 多角色 DeepSeek 协同：成绩分析师 → 省考专家 → 主规划师 → 质检员 → 统稿
 */
export async function generatePlanningOrchestrated(form, enhanced = {}) {
  const ctx = buildPlanningContext(form, enhanced)
  const contextBlock = formatContextForPrompt(ctx)
  const meta = { providersUsed: [], reviewRequired: false, reviewerNotes: [] }

  const baseFormText = `- 姓名：${form.studentName}
- 年级：${form.grade}
- 目标：${(form.goalDirections ?? []).join('、')}
- 成绩水平：${form.scoreLevel}
- 兴趣：${(form.interests ?? []).join('、')}
- 家长期望：${form.parentExpectations || '无'}
- 特殊说明：${form.specialNotes || '无'}`

  try {
    // 1. 成绩分析师
    const analyst = await callRole(
      '你是资深学业数据分析师。基于历次考试数据做量化分析，禁止空泛臆测。只输出 JSON：{"summary":"...","weakSubjects":[],"strongSubjects":[],"volatilityComment":"...","rankComment":"..."}',
      `${baseFormText}\n${contextBlock}`,
      'DeepSeek-成绩分析',
    )
    meta.providersUsed.push(analyst.label)
    meta.scoreAnalystSummary = analyst.parsed.summary || analyst.parsed.text

    // 2. 省考/选考专家
    const provincial = await callRole(
      '你是省考试院政策与志愿填报专家。结合省份考试制度（如浙江首考+高考、7选3）输出 JSON：{"examSystemNote":"...","timeline":[{"month":"","event":"","note":""}],"volunteerGuidance":[],"electiveAdvice":[{"subject":"","advice":""}]}',
      `${baseFormText}\n省份：${ctx.province}\n选考：${(ctx.electiveSubjects || []).join('、')}\n${contextBlock}`,
      'DeepSeek-省考专家',
    )
    meta.providersUsed.push(provincial.label)
    meta.provincialExpertSummary = provincial.parsed.examSystemNote || provincial.parsed.text

    // 3. 主规划师
    const planner = await callRole(
      buildKnowledgeSystemPrompt(),
      `请生成完整教育规划 JSON（6大模块齐全）。必须结合以下真实分析，不得与数据矛盾：
${baseFormText}

${contextBlock}

【分析师结论】${JSON.stringify(analyst.parsed)}
【省考专家结论】${JSON.stringify(provincial.parsed)}

${EXTENDED_SCHEMA}`,
      'DeepSeek-主规划师',
    )
    meta.providersUsed.push(planner.label)

    // 4. 质检员
    const reviewer = await callRole(
      '你是教育规划质检员。检查方案是否与成绩分析、省份考试制度、时间节点一致。只输出 JSON：{"approved":true|false,"issues":["问题"],"fixes":["修改建议"]}',
      `规划摘要：${JSON.stringify(planner.parsed).slice(0, 6000)}\n分析师：${JSON.stringify(analyst.parsed)}\n省考：${JSON.stringify(provincial.parsed)}`,
      'DeepSeek-质检员',
    )
    meta.providersUsed.push(reviewer.label)
    if (reviewer.parsed.approved === false) {
      meta.reviewRequired = true
      meta.reviewerNotes = reviewer.parsed.issues || []
    }

    // 5. 若有质检问题，统稿修订
    let finalRaw = planner.parsed
    if (meta.reviewRequired && reviewer.parsed.fixes?.length) {
      const reviser = await callRole(
        '你是规划统稿编辑。根据质检意见修订规划 JSON，只输出完整 JSON。',
        `原规划：${JSON.stringify(planner.parsed).slice(0, 5000)}\n质检问题：${JSON.stringify(reviewer.parsed)}`,
        'DeepSeek-统稿',
      )
      meta.providersUsed.push(reviser.label)
      if (reviser.parsed?.title) finalRaw = reviser.parsed
      meta.finalNotes = '已根据多 AI 质检意见统稿修订'
    }

    const report = normalizeReport(finalRaw, form)
    report.scoreAnalysis = {
      ...(enhanced.scoreAnalysis ?? {}),
      summary: meta.scoreAnalystSummary || enhanced.scoreAnalysis?.summary || '',
      weakSubjects: analyst.parsed.weakSubjects || enhanced.scoreAnalysis?.weakSubjects || [],
      strongSubjects: analyst.parsed.strongSubjects || enhanced.scoreAnalysis?.strongSubjects || [],
      subjectInsights: enhanced.scoreAnalysis?.subjectInsights ?? [],
      recordCount: enhanced.scoreAnalysis?.recordCount ?? 0,
      overallTrend: enhanced.scoreAnalysis?.overallTrend ?? 'stable',
      overallDelta: enhanced.scoreAnalysis?.overallDelta ?? 0,
      volatilityIndex: enhanced.scoreAnalysis?.volatilityIndex ?? 0,
      rankTrend: enhanced.scoreAnalysis?.rankTrend ?? null,
    }
    report.examTimeline = report.examTimeline ?? provincial.parsed.timeline ?? ctx.examSystem.timeline
    report.volunteerGuidance = report.volunteerGuidance ?? provincial.parsed.volunteerGuidance ?? ctx.examSystem.volunteerNotes
    report.electiveAdvice = report.electiveAdvice ?? provincial.parsed.electiveAdvice
    report.studentProfile = {
      ...report.studentProfile,
      academicTerm: enhanced.academicTerm,
      electiveSubjects: enhanced.electiveSubjects,
      examSystemNote: provincial.parsed.examSystemNote || ctx.examSystem.gaokaoMode,
    }
    report.orchestrationMeta = meta
    report.source = 'ai'

    return {
      report,
      message: `教育规划方案生成成功（${meta.providersUsed.length} 个 AI 角色协同）`,
      isMockFallback: false,
      orchestrationMeta: meta,
    }
  } catch (error) {
    const errorDetail = serializeError(error)
    console.error('[规划协同] 失败，降级 mock:', errorDetail)
    const report = buildMockPlanningReport(form)
    if (enhanced.scoreAnalysis) {
      report.scoreAnalysis = {
        summary: enhanced.scoreAnalysis.summary,
        weakSubjects: enhanced.scoreAnalysis.weakSubjects,
        strongSubjects: enhanced.scoreAnalysis.strongSubjects,
      }
    }
    return {
      report,
      message: MOCK_FALLBACK_MESSAGE,
      isMockFallback: true,
      errorDetail,
    }
  }
}

export { MOCK_FALLBACK_MESSAGE }
