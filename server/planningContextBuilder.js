import { getProvinceExamProfile } from './planning/provinceExamProfiles.js'

export function buildPlanningContext(form, enhanced = {}) {
  const school = enhanced.schoolInfo ?? {}
  const province = school.province || '未填写'
  const profile = getProvinceExamProfile(province)
  const scoreAnalysis = enhanced.scoreAnalysis ?? null
  const scoreHistory = enhanced.scoreHistory ?? []
  const electiveSubjects = enhanced.electiveSubjects ?? []
  const examDataRef = enhanced.examDataRef ?? null
  const academicTerm = enhanced.academicTerm ?? '未指定'

  return {
    province,
    city: school.city,
    district: school.district,
    schoolName: school.schoolName,
    academicTerm,
    electiveSubjects,
    examSystem: profile,
    scoreAnalysis,
    scoreHistory,
    examDataRef,
    ranking: enhanced.ranking,
    subjectScores: enhanced.subjectScores,
    targetSchools: enhanced.targetSchools,
    specialties: enhanced.specialties,
  }
}

export function formatContextForPrompt(ctx) {
  const lines = [
    `【省份考试制度】${ctx.examSystem.gaokaoMode}`,
    ctx.examSystem.electiveRule ? `选考规则：${ctx.examSystem.electiveRule}` : '',
    ctx.electiveSubjects?.length ? `已选科目：${ctx.electiveSubjects.join('、')}` : '',
    `当前学期：${ctx.academicTerm}`,
    ctx.schoolName ? `学校：${ctx.province}${ctx.city}${ctx.schoolName}` : '',
  ]

  if (ctx.scoreAnalysis?.summary) {
    lines.push(`【成绩波动分析】${ctx.scoreAnalysis.summary}`)
    if (ctx.scoreAnalysis.weakSubjects?.length) {
      lines.push(`薄弱科目：${ctx.scoreAnalysis.weakSubjects.join('、')}`)
    }
    if (ctx.scoreAnalysis.strongSubjects?.length) {
      lines.push(`优势科目：${ctx.scoreAnalysis.strongSubjects.join('、')}`)
    }
  }

  if (ctx.scoreHistory?.length) {
    lines.push(`【历次考试】共${ctx.scoreHistory.length}次`)
    for (const rec of ctx.scoreHistory.slice(-4)) {
      const scores = rec.subjectScores
        .filter((s) => s.score != null)
        .map((s) => `${s.subject}${s.score}`)
        .join(' ')
      lines.push(
        `- ${rec.academicYear} ${rec.term} ${rec.examName || rec.examType}（${rec.examDate}）${scores}${rec.schoolRank ? ` 校排${rec.schoolRank}` : ''}`,
      )
    }
  }

  if (ctx.examDataRef) {
    const cutoffs = ctx.examDataRef.subjects?.[0]?.cutoffLines?.map((c) => `${c.tier}${c.score}`).join(' ')
    if (cutoffs) lines.push(`【参考分数线】${cutoffs}`)
  }

  if (ctx.examSystem.timeline?.length) {
    lines.push('【关键时间节点】')
    for (const t of ctx.examSystem.timeline) {
      lines.push(`- ${t.month} ${t.event}${t.note ? `（${t.note}）` : ''}`)
    }
  }

  return lines.filter(Boolean).join('\n')
}
