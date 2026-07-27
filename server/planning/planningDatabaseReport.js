/**
 * 数据库 + 知识库驱动的规划报告（不依赖 DeepSeek）
 */
import { normalizePathOptions } from './planningEnrichment.js'

function pickElectiveSubjects(form, enhanced) {
  const fromWizard = form.electiveSubjectScores?.map((s) => s.subject).filter(Boolean)
  if (fromWizard?.length) return fromWizard
  if (enhanced.electiveSubjects?.length) return enhanced.electiveSubjects
  return []
}

function buildDiagnosis({ form, enhanced, planningEnrichment, studentContext, lookup, isDegraded }) {
  const name = form.studentName || '学生'
  const grade = form.grade || enhanced.schoolInfo?.grade || ''
  const fiveDim = planningEnrichment.fiveDimension
  const total = fiveDim?.totalScore ?? form.competencyScore ?? 0
  const tier = lookup.tier || lookup.university || form.targetTierLevel || '目标层次'
  const exams = studentContext.recentExamRecords || []

  let examHint = ''
  if (exams.length) {
    const latest = exams[0]
    examHint = `最近一次考试「${latest.exam_name || '考试'}」（${latest.exam_date || ''}）已纳入分析。`
  } else if (form.competencyScore) {
    examHint = `综合竞争力指数 ${form.competencyScore} 分。`
  }

  const hollandLine = planningEnrichment.hollandScoresLine
    ? `霍兰德测评：${planningEnrichment.hollandScoresLine}。`
    : ''

  const degradedNote = isDegraded
    ? '目标院校采用层级估算录取区间，正式填报请以考试院数据为准。'
    : ''

  return `${name}（${grade}）五维总分 ${total}/100，主目标「${form.primaryGoal || form.goalDirections?.[0] || '升学'}」，期望层次「${tier}」。${examHint}${hollandLine}${degradedNote}`.slice(
    0,
    200,
  )
}

function buildActionList90Days(fiveStagePlan, form) {
  const actions = []
  for (const stage of fiveStagePlan.slice(0, 3)) {
    for (const task of (stage.coreTasks || []).slice(0, 2)) {
      actions.push(`【${stage.name}】${task}`)
    }
  }
  const weak = form.mainSubjectScores?.find((s) => s.score != null && s.score < 70)?.subject
  if (weak) actions.push(`针对薄弱主科「${weak}」每周完成2套专项卷并复盘`)
  if (form.targetMajorIntent?.trim()) {
    actions.push(`围绕意向专业「${form.targetMajorIntent}」了解选科与院校要求`)
  }
  const defaults = [
    '建立周测错题闭环，每周日复盘',
    '每月一次模考并更新目标差距表',
    '固定每日学习时段，保证睡眠与运动',
    '关注首考/一模时间节点，提前4周进入冲刺',
    '整理选科与目标专业匹配清单',
    '与家长沟通阶段性目标并签字确认',
  ]
  while (actions.length < 6 && defaults.length) {
    actions.push(defaults.shift())
  }
  return actions.slice(0, 10)
}

function buildPhaseTasks(fiveStagePlan) {
  return fiveStagePlan.slice(0, 4).map((stage) => ({
    phase: `${stage.name}（${stage.period || stage.period_label || ''}）`,
    tasks: (stage.coreTasks || []).slice(0, 3).map((task) => ({
      name: task,
      criteria: stage.calibrationCheckpoint || '按阶段验收标准完成',
      duration: stage.durationWeeks ? `${stage.durationWeeks}周` : '4周',
      knowledgePoints: stage.objectives?.slice(0, 2) || [],
      relatedExercises: stage.deliverables?.slice(0, 2) || ['同步练习', '专题卷'],
    })),
  }))
}

function buildMilestones(fiveStagePlan, lookup) {
  const now = new Date()
  const month = (offset) => {
    const d = new Date(now)
    d.setMonth(d.getMonth() + offset)
    return `${d.getFullYear()}年${d.getMonth() + 1}月`
  }
  const fromStages = fiveStagePlan.slice(0, 4).map((s, i) => ({
    date: s.period_label || month(i * 2),
    event: s.name,
    preparationAdvice: s.calibrationCheckpoint || s.objectives?.[0] || '',
  }))
  if (lookup.strategyHint) {
    fromStages.unshift({
      date: month(0),
      event: '目标校准',
      preparationAdvice: lookup.strategyHint,
    })
  }
  return fromStages.slice(0, 6)
}

function buildSubjectPaths(form, enhanced) {
  const electives = pickElectiveSubjects(form, enhanced)
  const mains = ['语文', '数学', '英语']
  const scores = [...(form.mainSubjectScores || []), ...(form.electiveSubjectScores || [])]
  const subjects = [...mains, ...electives.filter((s) => !mains.includes(s))].slice(0, 6)

  return subjects.map((subject) => {
    const row = scores.find((s) => s.subject === subject)
    const score = row?.score
    const importance = subject === '数学' ? 5 : subject === '英语' || subject === '语文' ? 4 : 4
    const weak = score != null && score < 70
    return {
      subject,
      importance,
      timePercent: Math.round(100 / subjects.length),
      keyKnowledgePoints: weak ? ['薄弱模块突破', '基础题得分率'] : ['核心考点', '综合应用'],
      resourceTypes: ['同步练习', '限时模拟'],
    }
  })
}

export function buildDatabaseDrivenPlanningReport(ctx) {
  const {
    lookup,
    templates,
    form = {},
    enhanced = {},
    planningEnrichment = {},
    studentContext = {},
    fiveStagePlan = [],
    gapBand,
    citation,
    isDegraded,
  } = ctx

  const studentName = form.studentName || enhanced.studentName || '学生'
  const grade = form.grade || enhanced.schoolInfo?.grade || ''
  const fiveDim = planningEnrichment.fiveDimension || {}
  const fiveDimTotal = fiveDim.totalScore ?? form.competencyScore ?? 60

  const diagnosis = buildDiagnosis({
    form,
    enhanced,
    planningEnrichment,
    studentContext,
    lookup,
    isDegraded,
  })

  const pathOptions = normalizePathOptions({}, fiveDimTotal, { ...form, ...enhanced })

  const professionalReport = {
    diagnosis,
    recommendedPaths: pathOptions.map((p, i) => ({
      type: i === 0 ? 'main' : i === 1 ? 'backup' : 'fallback',
      path: p.name,
      reason: p.reason,
    })),
    keyTimeline: buildMilestones(fiveStagePlan, lookup).map((m) => ({
      month: m.date,
      event: m.event,
      note: m.preparationAdvice,
    })),
    actionList90Days: buildActionList90Days(fiveStagePlan, form),
    riskAlerts: isDegraded
      ? ['部分录取数据为层级估算，志愿填报请以教育考试院公布为准']
      : gapBand?.add_risk
        ? [gapBand.add_risk]
        : ['保持主科稳定，避免阶段性目标过多导致精力分散'],
  }

  const abilityDimensions = fiveDim.totalScore
    ? [
        { label: '学科成绩', score: fiveDim.academicScore },
        { label: '综合能力', score: fiveDim.abilityScore },
        { label: '兴趣匹配', score: fiveDim.interestScore },
        { label: '家庭资源', score: fiveDim.resourceScore },
        { label: '目标期望', score: fiveDim.targetScore },
      ]
    : []

  const examNotes = (studentContext.recentExamRecords || [])
    .slice(0, 2)
    .map((r) => `${r.exam_name || '考试'}(${r.exam_date || ''})`)
    .join('、')

  return {
    title: `${studentName} · ${grade} · 数据驱动教育规划方案`,
    generatedAt: new Date().toISOString(),
    targetUniversity: lookup.university,
    targetMajor: lookup.major || form.targetMajorIntent || '通用',
    degradedMode: isDegraded,
    degradedWarning: isDegraded ? lookup.message || templates.empty_data_rule?.degraded_mode_message : undefined,
    studentProfile: {
      name: studentName,
      grade,
      scoreLevel: form.scoreLevel || '良好',
      goalDirections: form.goalDirections || [],
      interests: form.interests || [],
      parentExpectations: form.parentExpectations || '',
      specialNotes: [
        form.specialNotes,
        examNotes ? `已关联考试记录：${examNotes}` : '',
        planningEnrichment.hollandScoresLine ? `霍兰德：${planningEnrichment.hollandScoresLine}` : '',
        isDegraded ? '（含层级估算数据）' : '',
      ]
        .filter(Boolean)
        .join('\n'),
      electiveSubjects: pickElectiveSubjects(form, enhanced),
    },
    abilityDimensions,
    fiveStagePlan,
    stageGoals: fiveStagePlan.slice(0, 3).map((s) => ({
      period: s.period || s.period_label || s.name,
      phase: s.name,
      coreTasks: s.coreTasks || [],
      expectedOutcomes: s.objectives || [],
    })),
    subjectPaths: buildSubjectPaths(form, enhanced),
    phaseTasks: buildPhaseTasks(fiveStagePlan),
    milestones: buildMilestones(fiveStagePlan, lookup),
    risks: professionalReport.riskAlerts.map((risk) => ({
      risk,
      impact: '中',
      mitigation: gapBand?.strategy || '按五阶段计划动态校准',
    })),
    volunteerGuidance: lookup.admission?.elective_requirement
      ? [`选科要求参考：${lookup.admission.elective_requirement}`]
      : [],
    pathOptions,
    professionalReport,
    dataSourceCitations: [
      citation,
      '学生档案与考试记录：Supabase（profiles / exam_records）',
      '规划框架：planning-templates.json',
      '生成模式：数据库驱动（结构化报告，含已有数据库字段）',
    ],
    source: isDegraded ? 'database-driven-degraded' : 'database-driven',
  }
}
