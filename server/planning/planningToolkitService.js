/**
 * 教育规划工具箱 — 选科分析 / 90天清单 / 题库推荐
 */
import { callDeepSeekAI, extractJson } from '../deepseekClient.js'
import { createServiceRoleClient, isSupabaseAdminConfigured } from '../supabaseAdmin.js'
import { satisfiesZhejiangSubjectRequirement } from '../volunteer/zhejiang/electiveValidator.js'

const ELECTIVE_SUBJECTS = ['物理', '历史', '化学', '生物', '政治', '地理']

/** 6 门选科 C(6,3) 组合 */
function buildElectiveCombinations() {
  const result = []
  for (let i = 0; i < ELECTIVE_SUBJECTS.length; i += 1) {
    for (let j = i + 1; j < ELECTIVE_SUBJECTS.length; j += 1) {
      for (let k = j + 1; k < ELECTIVE_SUBJECTS.length; k += 1) {
        result.push([ELECTIVE_SUBJECTS[i], ELECTIVE_SUBJECTS[j], ELECTIVE_SUBJECTS[k]])
      }
    }
  }
  return result
}

function subjectTypeForCombo(combo) {
  if (combo.includes('物理')) return '物理类'
  if (combo.includes('历史')) return '历史类'
  return null
}

function comboLabel(combo) {
  return combo.join('+')
}

function avgScoreForCombo(combo, scores) {
  const vals = combo.map((s) => Number(scores[s])).filter((n) => Number.isFinite(n) && n > 0)
  if (!vals.length) return 0
  return vals.reduce((a, b) => a + b, 0) / vals.length
}

async function fetchAdmissionPlans(subjectType) {
  if (!isSupabaseAdminConfigured()) return []
  const admin = createServiceRoleClient()

  const tables = ['zhejiang_admission_plans', 'college_admission_data']
  for (const table of tables) {
    try {
      let query = admin.from(table).select('*').limit(5000)
      if (table === 'zhejiang_admission_plans') {
        query = query.eq('subject_type', subjectType)
      } else {
        query = query.eq('province', '浙江').eq('subject_type', subjectType)
      }
      const { data, error } = await query
      if (error) continue
      if (data?.length) {
        return data.map((row) => ({
          subject_requirement: row.subject_requirement || '不限',
        }))
      }
    } catch {
      /* try next table */
    }
  }
  return []
}

/** 无数据库时的估算专业覆盖基数 */
const FALLBACK_COVERAGE = {
  '物理+化学+生物': 4200,
  '物理+化学+地理': 3800,
  '物理+生物+地理': 2100,
  '历史+政治+地理': 3600,
  '历史+政治+化学': 2400,
  '历史+地理+生物': 1800,
}

function fallbackCoverage(combo) {
  const key = comboLabel(combo)
  if (FALLBACK_COVERAGE[key]) return FALLBACK_COVERAGE[key]
  const hasPhysics = combo.includes('物理')
  const hasHistory = combo.includes('历史')
  const base = hasPhysics ? 2800 : hasHistory ? 2500 : 1200
  return base + combo.filter((s) => ['化学', '生物'].includes(s)).length * 400
}

export async function analyzeSubjectSelection(scores = {}) {
  const combos = buildElectiveCombinations()
  const plansByType = {
    物理类: await fetchAdmissionPlans('物理类'),
    历史类: await fetchAdmissionPlans('历史类'),
  }

  const ranked = combos
    .map((combo) => {
      const subjectType = subjectTypeForCombo(combo)
      if (!subjectType) return null

      const plans = plansByType[subjectType] || []
      let majorCount = 0
      let total = plans.length

      if (total > 0) {
        majorCount = plans.filter((p) =>
          satisfiesZhejiangSubjectRequirement(combo, p.subject_requirement),
        ).length
      } else {
        majorCount = fallbackCoverage(combo)
        total = 5000
      }

      const coverageRate = total > 0 ? Math.round((majorCount / total) * 1000) / 10 : 0
      const scoreAvg = avgScoreForCombo(combo, scores)
      const rankScore = majorCount * 0.65 + scoreAvg * 0.35

      return {
        combo: comboLabel(combo),
        subjects: combo,
        subjectType,
        majorCount,
        totalMajors: total,
        coverageRate,
        scoreAvg: Math.round(scoreAvg * 10) / 10,
        rankScore,
      }
    })
    .filter(Boolean)
    .sort((a, b) => b.rankScore - a.rankScore)
    .slice(0, 3)

  const advice = await generateSubjectAdvice(scores, ranked)

  return {
    success: true,
    recommendations: ranked.map((r) => ({
      combo: r.combo,
      subjects: r.subjects,
      majorCount: r.majorCount,
      coverageRate: r.coverageRate,
      scoreAvg: r.scoreAvg,
      subjectType: r.subjectType,
    })),
    advice,
  }
}

async function generateSubjectAdvice(scores, recommendations) {
  const top = recommendations[0]
  if (!top) return '请先填写各选科科目成绩后再进行分析。'

  const scoreLines = ELECTIVE_SUBJECTS.map((s) => `${s}：${scores[s] ?? '未填'}`).join('、')

  try {
    const content = await callDeepSeekAI(
      '你是浙江新高考选科指导专家。根据学生6门选考科目成绩与推荐组合，给出200字以内的简短建议，语气专业、可执行，不要使用 markdown。',
      `学生成绩：${scoreLines}。推荐组合Top1：${top.combo}（专业覆盖约${top.majorCount}个，覆盖率${top.coverageRate}%）。请结合其优势科目给出选科建议。`,
      { temperature: 0.5, maxTokens: 400, label: '选科建议' },
    )
    const text = String(content || '').trim()
    return text.slice(0, 220) || buildFallbackAdvice(top, scores)
  } catch (err) {
    console.warn('[planningToolkit] 选科建议 AI 失败', err?.message)
    return buildFallbackAdvice(top, scores)
  }
}

function buildFallbackAdvice(top, scores) {
  const best = ELECTIVE_SUBJECTS.filter((s) => Number(scores[s]) >= 80).join('、') || '暂无突出优势科'
  return `综合专业覆盖率与您的成绩，建议优先考虑「${top.combo}」组合（覆盖约 ${top.majorCount} 个专业）。您当前较强科目为 ${best}，选科时建议保留优势项并兼顾目标专业选考要求，高一阶段可先按推荐组合强化，再根据模考微调。`
}

const GOAL_LABELS = {
  冲刺985: '以985/顶尖院校为核心目标，强化总分与竞赛/强基备选',
  稳定211: '以211/双一流为主目标，注重稳健提分与选科匹配',
  省内重本: '以浙江省内重点本科为目标，夯实基础、控制失分',
  艺术联考: '兼顾艺术专业课与文化课，按联考节点倒排文化复习',
  出国留学: '兼顾语言与学术背景，按目标国别准备标化与活动',
}

export async function generateActionChecklist({ grade, goal, weakSubject, teacherId }) {
  const practiceTips = await fetchPracticeRecommendations(weakSubject, teacherId)
  const goalDesc = GOAL_LABELS[goal] || goal

  let weeks = []
  try {
    const raw = await callDeepSeekAI(
      `你是K12升学规划师。请生成12周（90天）行动清单 JSON，格式：
{"weeks":[{"week":1,"focus":"学习重点","tasks":["任务1","任务2"],"milestone":"里程碑"}]}
只输出 JSON，共12个 week，tasks 每周2-3条，语言简洁中文。`,
      `年级：${grade}；主目标：${goal}（${goalDesc}）；最薄弱科目：${weakSubject}。请生成针对性12周清单。`,
      { temperature: 0.55, maxTokens: 2500, label: '行动清单' },
    )
    const jsonStr = extractJson(raw)
    const parsed = JSON.parse(jsonStr)
    if (Array.isArray(parsed?.weeks) && parsed.weeks.length) {
      weeks = parsed.weeks.slice(0, 12)
    }
  } catch (err) {
    console.warn('[planningToolkit] 行动清单 AI 失败', err?.message)
  }

  if (!weeks.length) {
    weeks = buildFallbackWeeks(grade, goal, weakSubject)
  }

  return {
    success: true,
    grade,
    goal,
    weakSubject,
    weeks,
    practiceTips,
  }
}

function buildFallbackWeeks(grade, goal, weakSubject) {
  const phases = [
    { focus: '诊断摸底', tasks: [`完成${weakSubject}错题归类`, '制定每日学习时段', '建立周测记录表'] },
    { focus: '基础巩固', tasks: [`${weakSubject}核心概念梳理`, '完成3套基础卷', '整理知识清单'] },
    { focus: '专项突破', tasks: [`${weakSubject}高频题型训练`, '限时模拟小测', '复盘失分原因'] },
  ]
  return Array.from({ length: 12 }, (_, i) => {
    const p = phases[i % phases.length]
    return {
      week: i + 1,
      focus: `${grade} · ${goal} · ${p.focus}（第${i + 1}周）`,
      tasks: p.tasks,
      milestone: i % 4 === 3 ? `第${i + 1}周：${weakSubject}小测成绩较基线提升5%以上` : `第${i + 1}周：完成本周全部关键任务`,
    }
  })
}

async function fetchPracticeRecommendations(subject, teacherId) {
  if (!subject || !isSupabaseAdminConfigured()) {
    return buildStaticPracticeTips(subject)
  }

  const admin = createServiceRoleClient()
  let data = null
  let error = null

  if (teacherId) {
    const res = await admin
      .from('teacher_question_bank')
      .select('topic_tag, topic_group, knowledge_point, subject, difficulty')
      .eq('subject', subject)
      .eq('teacher_id', teacherId)
      .limit(80)
    data = res.data
    error = res.error
  }

  if (!data?.length) {
    const res = await admin
      .from('teacher_question_bank')
      .select('topic_tag, topic_group, knowledge_point, subject, difficulty')
      .eq('subject', subject)
      .limit(80)
    data = res.data
    error = res.error
  }

  if (error || !data?.length) {
    return buildStaticPracticeTips(subject)
  }

  const points = [
    ...new Set(
      data
        .map((r) => r.topic_tag?.trim() || r.topic_group?.trim() || r.knowledge_point?.trim())
        .filter(Boolean),
    ),
  ]

  if (points.length < 3) {
    return buildStaticPracticeTips(subject).map((tip, i) => ({
      ...tip,
      knowledgePoint: points[i] || tip.knowledgePoint,
    }))
  }

  return points.slice(0, 3).map((kp) => ({
    subject,
    knowledgePoint: kp,
    difficulty: data.find((d) => d.topic_tag === kp || d.knowledge_point === kp)?.difficulty || '中等',
  }))
}

function buildStaticPracticeTips(subject) {
  const defaults = {
    语文: ['文言文阅读', '议论文写作', '古诗鉴赏'],
    数学: ['函数与导数', '立体几何', '概率统计'],
    英语: ['阅读理解', '完形填空', '书面表达'],
    物理: ['力学综合', '电磁感应', '实验题'],
    化学: ['有机推断', '反应原理', '实验操作'],
    生物: ['遗传规律', '稳态调节', '实验设计'],
    历史: ['材料分析', '时空观念', '论述题'],
    地理: ['自然地理过程', '区域发展', '读图分析'],
    政治: ['哲学与文化', '经济生活', '时政热点'],
  }
  return (defaults[subject] || ['基础巩固', '专题训练', '限时模拟']).map((kp) => ({
    subject,
    knowledgePoint: kp,
    difficulty: '中等',
  }))
}
