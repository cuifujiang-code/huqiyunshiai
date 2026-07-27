/**
 * 华祺教育规划 · DeepSeek system prompt 与学生上下文 enrichment
 */
import { createServiceRoleClient, isSupabaseAdminConfigured } from '../supabaseAdmin.js'

export const HUQI_PLANNING_SYSTEM_PROMPT = `你是华祺教育的专业教育规划师，请严格按照以下专业框架生成规划报告：

【规划层次】学业规划 > 升学路径 > 专业方向 > 职业远景

【五维评估体系】
- 学科成绩（占比35%）：基于实际分数，折算为百分制竞争力指数
- 综合能力（占比20%）：竞赛获奖、社会活动、领导力、学习习惯
- 兴趣匹配度（占比20%）：基于霍兰德RIASEC六维测评结果
- 家庭资源（占比15%）：年均教育预算、家长学历背景、人脉资源
- 目标期望（占比10%）：院校层次目标、专业意向清晰度

【路径分级体系】
- 顶尖路线（五维总分 85+）：985冲刺 / 国际顶尖院校
- 优秀路线（五维总分 70-84）：211/双一流 / 海外知名大学
- 稳健路线（五维总分 55-69）：省内重本 / 海外普通大学
- 保底路线（五维总分 54以下）：专科提升 / 技能路线

【核心规划原则】
- 以学生实际能力为基础，不过度拔高期望
- 以家庭资源为约束条件，给出可实现的方案
- 以兴趣特长为导向，提升学习内驱力
- 以目标院校/专业为终点，倒推关键节点

【报告必须包含的结构】
① 现状诊断（100字以内，直接点出核心问题）
② 推荐路径（3条：主路径 + 备选路径 + 保底路径，各含匹配理由）
③ 关键时间节点（精确到月份，从当前年级倒推）
④ 90天行动清单（具体可执行的任务，不少于6条）
⑤ 风险提示（1-2条最重要的注意事项）

【输出要求】
- 所有建议必须具体可操作，禁止出现"努力学习""认真复习"等宏观建议
- 时间节点必须精确到月份（如"高二下学期3月前完成……"）
- 针对浙江新高考选科体系，必须说明选科对大学专业报考的影响
- 语言简洁专业，避免口水话，总字数控制在800字以内

【数据驱动硬性规则（与上述框架同时遵守）】
1. 必须严格基于用户提供的院校录取数据生成规划，禁止编造分数线、位次、招生计划。
2. 输出 JSON 必须包含 dataSourceCitations 数组，且至少一条与给定 citation 一致。
3. fiveStagePlan 必须包含完整的 5 个阶段，与知识库五阶段框架对应。
4. 只输出合法 JSON，不要 markdown 代码块。`

/** 从 Supabase 拉取霍兰德、选科、最近两次考试成绩 */
export async function fetchPlanningStudentContext(studentUserId, formOverrides = {}) {
  if (!studentUserId?.trim() || !isSupabaseAdminConfigured()) {
    return {
      hollandScores: null,
      selectedSubjects: null,
      latestExamRecord: null,
      recentExamRecords: [],
    }
  }

  const admin = createServiceRoleClient()
  const uid = studentUserId.trim()

  const [profileRes, examRes] = await Promise.all([
    admin
      .from('profiles')
      .select('holland_scores, selected_subjects')
      .eq('id', uid)
      .maybeSingle(),
    admin
      .from('exam_records')
      .select('id, exam_name, exam_date, scores_json, ai_report, created_at')
      .eq('student_user_id', uid)
      .order('exam_date', { ascending: false })
      .limit(2),
  ])

  if (profileRes.error) {
    console.warn('[planningStudentContext] profiles 查询失败', profileRes.error.message)
  }
  if (examRes.error) {
    console.warn('[planningStudentContext] exam_records 查询失败', examRes.error.message)
  }

  const recentExamRecords = examRes.data ?? []

  const profileHolland = profileRes.data?.holland_scores ?? null
  const overrideHolland = formOverrides.hollandScores ?? null

  return {
    hollandScores: overrideHolland || profileHolland,
    selectedSubjects: profileRes.data?.selected_subjects ?? null,
    latestExamRecord: recentExamRecords[0] ?? null,
    recentExamRecords,
  }
}

export function formatPlanningStudentContextBlock(ctx) {
  const lines = []

  if (ctx.hollandScores && typeof ctx.hollandScores === 'object' && Object.keys(ctx.hollandScores).length) {
    const dims = ['R', 'I', 'A', 'S', 'E', 'C']
    const scores = dims
      .map((d) => {
        const v = ctx.hollandScores[d]
        return v != null ? `${d}:${v}` : null
      })
      .filter(Boolean)
    lines.push(`【霍兰德 RIASEC 测评】${scores.join('、') || JSON.stringify(ctx.hollandScores)}`)
  }

  if (ctx.selectedSubjects) {
    const subs = Array.isArray(ctx.selectedSubjects)
      ? ctx.selectedSubjects
      : typeof ctx.selectedSubjects === 'string'
        ? (() => {
            try {
              return JSON.parse(ctx.selectedSubjects)
            } catch {
              return [ctx.selectedSubjects]
            }
          })()
        : []
    if (subs.length) {
      lines.push(`【当前选科（7选3）】${subs.filter(Boolean).join('、')}`)
    }
  }

  if (ctx.latestExamRecord) {
    const rec = ctx.latestExamRecord
    lines.push(
      `【最近一次考试成绩】${rec.exam_name || '考试'}（${rec.exam_date}）`,
    )
    const scores = rec.scores_json
    if (scores && typeof scores === 'object') {
      const subjectLines = Object.entries(scores)
        .filter(([k]) => !k.startsWith('_') && k !== 'lossReasons')
        .map(([subject, row]) => {
          if (!row || typeof row !== 'object') return null
          const s = row.score ?? '—'
          const avg = row.avg ?? '—'
          const max = row.max ?? '—'
          return `${subject}：本次${s} / 班均${avg} / 最高${max}`
        })
        .filter(Boolean)
      if (subjectLines.length) {
        lines.push(subjectLines.join('\n'))
      }
      if (Array.isArray(scores.lossReasons) && scores.lossReasons.length) {
        lines.push(`失分原因自评：${scores.lossReasons.join('、')}`)
      }
    }
    if (rec.ai_report) {
      lines.push(`考试复盘摘要：${String(rec.ai_report).slice(0, 300)}…`)
    }
  }

  return lines.length ? lines.join('\n') : '（暂无霍兰德测评 / 选科 / 考试成绩数据）'
}

export function buildEnrichedUserPromptSections(form, enhanced, studentContextBlock, planningEnrichment = null, examTrendBlock = '') {
  const hollandLine = planningEnrichment?.hollandScoresLine || ''
  const fiveDimText = planningEnrichment?.fiveDimensionText || ''

  return `【学生扩展档案 — 来自 Supabase】
${studentContextBlock}

${examTrendBlock ? `${examTrendBlock}\n\n` : ''}【霍兰德六维测评结果（表单 Step 3）】
${hollandLine || '（表单未填写，见上方档案）'}

【五维综合竞争力分析】
${fiveDimText || '（待计算）'}

【学生表单】
- 姓名：${form.studentName || '学生'}
- 年级：${form.grade || enhanced.schoolInfo?.grade || '未填'}
- 目标方向：${(form.goalDirections ?? []).join('、') || '未指定'}
- 主目标：${form.primaryGoal || enhanced.primaryGoal || '未填'}
- 期望院校层次：${form.targetTierLevel || enhanced.targetTierLevel || '未填'}
- 意向专业：${form.targetMajorIntent || enhanced.targetMajorIntent || '未填'}
- 当前成绩水平：${form.scoreLevel || '未填'}
- 综合竞争力指数：${form.competencyScore ?? enhanced.competencyScore ?? '未计算'}
- 兴趣标签：${(form.interests ?? []).join('、') || '未填'}
- 特长标签：${(form.specialTalents ?? enhanced.specialTalents ?? []).join('、') || '未填'}
- 年均教育预算：${form.familyBudget || enhanced.familyBudget || '未填'}
- 家长期望：${form.parentExpectations || '未填'}
- 特殊需求：${form.specialNotes || '无'}
- 规划发起角色：${form.createdByRole === 'teacher' ? '教师' : '学生本人'}
- 选科（表单）：${(enhanced.electiveSubjects ?? []).join('、') || '见上方档案'}`
}
