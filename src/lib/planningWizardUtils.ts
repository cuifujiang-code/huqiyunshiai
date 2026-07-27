import type {
  AbilityDimension,
  EnhancedPlanningFormData,
  ExamDifficulty,
  HollandScores,
  WizardSubjectScore,
} from '../types/planning'
import { DEFAULT_HOLLAND_SCORES } from '../types/planning'

export const DIFFICULTY_COEFF: Record<ExamDifficulty, number> = {
  校内月考: 1,
  市级联考: 1.2,
  竞赛级: 1.5,
}

const HOLLAND_CAREERS: Record<keyof HollandScores, string> = {
  R: '工程师 / 技师 / 运维',
  I: '科研 / 数据分析 / 医学研究',
  A: '设计 / 创作 / 传媒艺术',
  S: '教师 / 心理咨询 / 社会工作',
  E: '管理 / 创业 / 市场营销',
  C: '会计 / 行政 / 金融事务',
}

/** 综合竞争力 = (主科均分/150*100)*0.6 + (选科均分/100*100)*0.4，分数按难度系数加权 */
export function calcCompetencyScore(
  mainScores: WizardSubjectScore[],
  electiveScores: WizardSubjectScore[],
): number {
  const adjMain = mainScores
    .filter((s) => s.score != null && s.score > 0)
    .map((s) => Math.min(150, s.score! * DIFFICULTY_COEFF[s.difficulty]))

  const adjElect = electiveScores
    .filter((s) => s.score != null && s.score > 0)
    .map((s) => Math.min(100, s.score! * DIFFICULTY_COEFF[s.difficulty]))

  let score = 0
  if (adjMain.length) {
    const avg = adjMain.reduce((a, b) => a + b, 0) / adjMain.length
    score += (avg / 150) * 100 * 0.6
  }
  if (adjElect.length) {
    const avg = adjElect.reduce((a, b) => a + b, 0) / adjElect.length
    score += (avg / 100) * 100 * 0.4
  }
  return Math.round(Math.min(100, Math.max(0, score)))
}

export function matchRouteLabel(competencyScore: number): string {
  if (competencyScore >= 85) return '顶尖路线'
  if (competencyScore >= 70) return '优秀路线'
  if (competencyScore >= 55) return '稳健路线'
  return '保底路线'
}

export function competencyColor(score: number): string {
  if (score >= 70) return 'text-green-400'
  if (score >= 55) return 'text-amber-400'
  return 'text-red-400'
}

export function hollandTopCareers(scores: HollandScores, n = 2): string[] {
  const sorted = (Object.entries(scores) as [keyof HollandScores, number][])
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
  return sorted.map(([k, v]) => `${k}型（${v}分）→ ${HOLLAND_CAREERS[k]}`)
}

export function buildFiveDimensionRadar(form: EnhancedPlanningFormData): AbilityDimension[] {
  const analysis = computeFiveDimensionAnalysis(form)
  return [
    { label: '成绩', score: analysis.academicScore },
    { label: '能力', score: analysis.abilityScore },
    { label: '兴趣', score: analysis.interestScore },
    { label: '资源', score: analysis.resourceScore },
    { label: '目标', score: analysis.targetScore },
  ]
}

export interface FiveDimensionAnalysis {
  academicScore: number
  abilityScore: number
  interestScore: number
  resourceScore: number
  targetScore: number
  totalScore: number
}

const FAMILY_BUDGET_SCORES: Record<string, number> = {
  '5万以下': 40,
  '5-15万': 60,
  '15-30万': 80,
  '30万以上': 100,
}

const TARGET_TIER_SCORES: Record<string, number> = {
  '985/顶尖院校': 92,
  '211/双一流': 78,
  省内重点本科: 62,
  普通本科: 48,
  暂时没想好: 45,
}

/** 五维综合竞争力（与 DeepSeek system prompt 权重一致） */
export function computeFiveDimensionAnalysis(
  form: Pick<
    EnhancedPlanningFormData,
    'hollandScores' | 'competencyScore' | 'specialTalents' | 'familyBudget' | 'targetTierLevel' | 'targetMajorIntent'
  >,
): FiveDimensionAnalysis {
  const hollandVals = Object.values(form.hollandScores ?? DEFAULT_HOLLAND_SCORES)
  const interestScore = hollandVals.length ? Math.max(...hollandVals) : 50
  const abilityScore = Math.min(100, 30 + (form.specialTalents?.length ?? 0) * 18)
  const resourceScore = FAMILY_BUDGET_SCORES[form.familyBudget] ?? 50
  let targetScore = TARGET_TIER_SCORES[form.targetTierLevel] ?? 50
  if (form.targetMajorIntent?.trim()) {
    targetScore = Math.min(100, targetScore + 8)
  }
  const academicScore = form.competencyScore ?? 0
  const totalScore = Math.round(
    academicScore * 0.35 +
      abilityScore * 0.2 +
      interestScore * 0.2 +
      resourceScore * 0.15 +
      targetScore * 0.1,
  )

  return {
    academicScore,
    abilityScore,
    interestScore,
    resourceScore,
    targetScore,
    totalScore: Math.min(100, Math.max(0, totalScore)),
  }
}

export function formatHollandScoresLine(scores: HollandScores): string {
  return (['R', 'I', 'A', 'S', 'E', 'C'] as const)
    .map((k) => `${k}:${scores[k] ?? 0}`)
    .join(' ')
}

export function formatFiveDimensionAnalysisText(analysis: FiveDimensionAnalysis): string {
  return [
    `- 学科成绩分：${analysis.academicScore}/100`,
    `- 综合能力分：${analysis.abilityScore}/100（根据特长标签数量估算）`,
    `- 兴趣匹配度：${analysis.interestScore}/100（霍兰德最高分/100）`,
    `- 家庭资源分：${analysis.resourceScore}/100（根据预算档位映射）`,
    `- 目标期望分：${analysis.targetScore}/100（目标越明确分越高）`,
    `- 五维总分：${analysis.totalScore}/100`,
  ].join('\n')
}

export function buildPlanningPromptEnrichment(form: EnhancedPlanningFormData) {
  const hollandScores = form.hollandScores ?? DEFAULT_HOLLAND_SCORES
  const fiveDimension = computeFiveDimensionAnalysis(form)
  return {
    hollandScoresLine: formatHollandScoresLine(hollandScores),
    hollandScores,
    fiveDimension,
    fiveDimensionText: formatFiveDimensionAnalysisText(fiveDimension),
  }
}

/** 向导数据同步到 legacy subjectScores / schoolInfo */
export function syncWizardToLegacyForm(form: EnhancedPlanningFormData): EnhancedPlanningFormData {
  const cityParts = form.city.split(/[省市区县]/).filter(Boolean)
  const province = form.city.includes('浙江') ? '浙江' : form.schoolInfo.province || ''
  const cityName = cityParts.length > 1 ? cityParts[1] : cityParts[0] || form.city

  const subjectScores = [...form.mainSubjectScores, ...form.electiveSubjectScores].map((s) => ({
    subject: s.subject,
    score: s.score,
    fullScore: ['语文', '数学', '英语'].includes(s.subject) ? 150 : 100,
    classRank: null,
    schoolRank: null,
    scoreTrend: 'stable' as const,
  }))

  const electiveSubjects = form.electiveSubjectScores.map((s) => s.subject)

  let goalDirections = [...form.goalDirections]
  if (form.primaryGoal === '科技竞赛（强基计划）') goalDirections = ['强基计划', '学科竞赛']
  else if (form.primaryGoal === '出国留学') goalDirections = ['出国留学']
  else if (form.primaryGoal === '艺术生联考') goalDirections = ['综合评价']
  else if (form.primaryGoal === '普通高考') goalDirections = ['高考']

  const scoreLevel =
    form.competencyScore >= 80 ? '优秀' : form.competencyScore >= 65 ? '良好' : form.competencyScore >= 50 ? '中等' : '待提升'

  return {
    ...form,
    goalDirections: goalDirections as EnhancedPlanningFormData['goalDirections'],
    scoreLevel: scoreLevel as EnhancedPlanningFormData['scoreLevel'],
    electiveSubjects,
    subjectScores,
    schoolInfo: {
      ...form.schoolInfo,
      province: province || form.schoolInfo.province,
      city: cityName || form.schoolInfo.city,
      grade: form.grade,
    },
    specialNotes: [
      form.specialNotes,
      form.targetMajorIntent ? `意向专业：${form.targetMajorIntent}` : '',
      form.householdType ? `户籍：${form.householdType}` : '',
      form.identityResources.length ? `身份资源：${form.identityResources.join('、')}` : '',
    ]
      .filter(Boolean)
      .join('\n'),
  }
}
