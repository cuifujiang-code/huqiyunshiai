/**
 * 期中考复盘 · 成绩分析 + DeepSeek 报告 + 题库推荐
 */
import { callDeepSeekAI } from '../deepseekClient.js'
import { createServiceRoleClient, isSupabaseAdminConfigured } from '../supabaseAdmin.js'

const CORE_SUBJECTS = ['语文', '数学', '英语']
const LOSS_REASON_OPTIONS = ['计算错误', '概念不清', '审题失误', '时间不够', '粗心大意']
const DEFAULT_ELECTIVES = ['物理', '化学', '生物']

/** 失分偏差率：(本次分数 - 班级平均分) / 年级最高分 */
export function calcDeviationRate(score, avg, max) {
  const s = Number(score)
  const a = Number(avg)
  const m = Number(max)
  if (!Number.isFinite(s) || !Number.isFinite(a) || !Number.isFinite(m) || m <= 0) return 0
  return (s - a) / m
}

/** 高优先级：低于平均超过 15%（年级满分基准） */
export function isHighPrioritySubject(score, avg, max) {
  return calcDeviationRate(score, avg, max) < -0.15
}

export function parseSubjectList(scoresJson, selectedSubjects = DEFAULT_ELECTIVES) {
  const electives = Array.isArray(selectedSubjects)
    ? selectedSubjects.filter(Boolean).slice(0, 3)
    : DEFAULT_ELECTIVES
  return [...CORE_SUBJECTS, ...electives]
}

export function buildScoreAnalysis(scoresJson, subjects) {
  return subjects.map((subject) => {
    const row = scoresJson?.[subject] || {}
    const score = Number(row.score ?? 0)
    const avg = Number(row.avg ?? 0)
    const max = Number(row.max ?? 100)
    const rate = calcDeviationRate(score, avg, max)
    return {
      subject,
      score,
      avg,
      max,
      deviationRate: rate,
      deviationPercent: Math.round(rate * 1000) / 10,
      highPriority: isHighPrioritySubject(score, avg, max),
    }
  })
}

async function fetchPreviousExamRecord(studentUserId, excludeId) {
  if (!isSupabaseAdminConfigured() || !studentUserId) return null
  const admin = createServiceRoleClient()
  let q = admin
    .from('exam_records')
    .select('id, exam_name, exam_date, scores_json, created_at')
    .eq('student_user_id', studentUserId)
    .order('exam_date', { ascending: false })
    .limit(2)
  const { data, error } = await q
  if (error) {
    console.warn('[examReview] 查询历史成绩失败', error.message)
    return null
  }
  const rows = (data || []).filter((r) => r.id !== excludeId)
  return rows[0] || null
}

async function fetchPracticeRecommendations(highPrioritySubjects) {
  if (!isSupabaseAdminConfigured() || !highPrioritySubjects?.length) return []
  const admin = createServiceRoleClient()
  const results = []

  for (const subject of highPrioritySubjects.slice(0, 3)) {
    const { data, error } = await admin
      .from('teacher_question_bank')
      .select('knowledge_point, subject, difficulty')
      .eq('subject', subject)
      .not('knowledge_point', 'is', null)
      .neq('knowledge_point', '')
      .limit(50)

    if (error || !data?.length) continue

    const points = [...new Set(data.map((r) => r.knowledge_point?.trim()).filter(Boolean))]
    for (let i = points.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[points[i], points[j]] = [points[j], points[i]]
    }
    const picked = points.slice(0, 1)
    picked.forEach((kp) => {
      results.push({ subject, knowledgePoint: kp })
    })
  }

  return results.slice(0, 3)
}

function buildTrendComparison(currentAnalysis, previousRecord) {
  if (!previousRecord?.scores_json) return null
  const prev = previousRecord.scores_json
  return currentAnalysis.map((row) => {
    const p = prev[row.subject]
    if (!p) return { subject: row.subject, previousScore: null, delta: null }
    const previousScore = Number(p.score ?? 0)
    return {
      subject: row.subject,
      previousScore,
      delta: row.score - previousScore,
    }
  })
}

function buildAiPrompt({
  examName,
  examDate,
  analysis,
  lossReasons,
  trend,
  practiceTips,
  previousExam,
}) {
  const analysisText = analysis
    .map((a) => {
      const flag = a.highPriority ? '【高优先级】' : ''
      return `${flag}${a.subject}：本次${a.score}分，班均${a.avg}，年级最高${a.max}，偏差率${a.deviationPercent}%`
    })
    .join('\n')

  const trendText = trend?.length
    ? trend
        .filter((t) => t.previousScore != null)
        .map((t) => `${t.subject}：上次${t.previousScore}分 → 本次${analysis.find((a) => a.subject === t.subject)?.score}分（${t.delta >= 0 ? '+' : ''}${t.delta}）`)
        .join('\n')
    : '（无上次考试记录）'

  const practiceText = practiceTips.length
    ? practiceTips.map((p) => `- ${p.subject} · ${p.knowledgePoint}`).join('\n')
    : '（题库暂无匹配知识点，请按薄弱科目自主刷题）'

  const system = `你是资深高中学习规划师，擅长期中考复盘与后半程冲刺计划。请用清晰的中文 Markdown 输出，面向学生与家长可读。`

  const user = `请基于以下期中考数据生成复盘报告。

## 考试信息
- 考试名称：${examName}
- 考试日期：${examDate}

## 各科偏差分析
偏差率公式：(本次分数 - 班级平均分) / 年级最高分 × 100%
负值表示低于班级平均；标注【高优先级】的科目失分严重，需优先突破。

${analysisText}

## 主要失分原因（学生自评）
${lossReasons.length ? lossReasons.join('、') : '未填写'}

## 与上次考试对比
${previousExam ? `上次：${previousExam.exam_name}（${previousExam.exam_date}）` : '无历史记录'}
${trendText}

## 推荐专项练习方向（来自题库知识点）
${practiceText}

---

请严格输出 JSON（不要 markdown 代码块包裹），格式：
{
  "diagnosis": "诊断分析全文（Markdown，含各科表现、进退步趋势、薄弱知识点，高优先级科目加粗说明）",
  "actionPlan": "后半程学习计划全文（Markdown，接下来4周按 Week1~Week4 列出重点任务，每周3-5条）"
}`

  return { system, user }
}

function parseAiJson(raw) {
  const text = String(raw || '').trim()
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) {
    return {
      diagnosis: text || '暂无诊断内容',
      actionPlan: '',
    }
  }
  try {
    const obj = JSON.parse(text.slice(start, end + 1))
    return {
      diagnosis: String(obj.diagnosis || obj.诊断分析 || '').trim(),
      actionPlan: String(obj.actionPlan || obj.action_plan || obj.学习计划 || '').trim(),
    }
  } catch {
    return { diagnosis: text, actionPlan: '' }
  }
}

function fallbackReport(analysis, lossReasons, practiceTips) {
  const weak = analysis.filter((a) => a.highPriority).map((a) => a.subject)
  const diagnosis = [
    '## 诊断分析',
    '',
    '### 各科表现',
    ...analysis.map(
      (a) =>
        `- **${a.subject}**：${a.score} 分（班均 ${a.avg}，最高 ${a.max}）偏差 ${a.deviationPercent}%${a.highPriority ? ' ⚠️ 需优先突破' : ''}`,
    ),
    '',
    '### 失分原因',
    lossReasons.length ? lossReasons.map((r) => `- ${r}`).join('\n') : '- 未填写',
    '',
    weak.length ? `### 薄弱科目\n${weak.join('、')} 低于班级平均超过 15%（按年级满分计），建议本周起加练。` : '',
    practiceTips.length
      ? `\n### 推荐练习\n${practiceTips.map((p) => `- ${p.subject}：${p.knowledgePoint}`).join('\n')}`
      : '',
  ].join('\n')

  const actionPlan = [
    '## 后半程学习计划（4 周）',
    '',
    '### 第 1 周',
    '- 整理本次试卷错题，按科目分类',
    '- 高优先级科目每天 30 分钟基础回顾',
    '',
    '### 第 2 周',
    '- 针对薄弱知识点完成 2 套专项练习',
    '- 语文/英语：积累本复盘',
    '',
    '### 第 3 周',
    '- 限时模拟小测，训练时间分配',
    '- 与班均差距大的科目加练计算/概念题',
    '',
    '### 第 4 周',
    '- 全真模拟卷 1 套',
    '- 回顾 4 周错题，查漏补缺',
  ].join('\n')

  return { diagnosis, actionPlan }
}

export async function generateExamReviewReport(payload) {
  const {
    studentUserId,
    examName = '期中考试',
    examDate,
    scoresJson = {},
    lossReasons = [],
    selectedSubjects,
  } = payload

  const subjects = parseSubjectList(scoresJson, selectedSubjects)
  const analysis = buildScoreAnalysis(scoresJson, subjects)
  const highPrioritySubjects = analysis.filter((a) => a.highPriority).map((a) => a.subject)

  const previousExam = await fetchPreviousExamRecord(studentUserId)
  const trend = buildTrendComparison(analysis, previousExam)
  const practiceTips = await fetchPracticeRecommendations(highPrioritySubjects)

  let diagnosis = ''
  let actionPlan = ''

  try {
    const { system, user } = buildAiPrompt({
      examName,
      examDate,
      analysis,
      lossReasons,
      trend,
      practiceTips,
      previousExam,
    })
    const raw = await callDeepSeekAI(system, user, { temperature: 0.35, label: 'ExamReview' })
    const parsed = parseAiJson(raw)
    diagnosis = parsed.diagnosis
    actionPlan = parsed.actionPlan
  } catch (err) {
    console.warn('[examReview] DeepSeek 失败，使用本地模板', err?.message || err)
    const fb = fallbackReport(analysis, lossReasons, practiceTips)
    diagnosis = fb.diagnosis
    actionPlan = fb.actionPlan
  }

  if (!diagnosis) {
    const fb = fallbackReport(analysis, lossReasons, practiceTips)
    diagnosis = fb.diagnosis
    actionPlan = actionPlan || fb.actionPlan
  }

  const enrichedScores = {
    ...scoresJson,
    lossReasons: lossReasons.filter((r) => LOSS_REASON_OPTIONS.includes(r)),
    _meta: {
      subjects,
      analysis,
      trend,
      practiceTips,
    },
  }

  let recordId = null
  if (isSupabaseAdminConfigured() && studentUserId) {
    const admin = createServiceRoleClient()
    const { data, error } = await admin
      .from('exam_records')
      .insert({
        student_user_id: studentUserId,
        exam_name: examName,
        exam_date: examDate,
        scores_json: enrichedScores,
        ai_report: diagnosis,
        action_plan: actionPlan,
      })
      .select('id')
      .single()

    if (error) {
      console.error('[examReview] 保存记录失败', error.message)
    } else {
      recordId = data?.id
    }
  }

  return {
    recordId,
    examName,
    examDate,
    analysis,
    trend,
    practiceTips,
    highPrioritySubjects,
    diagnosis,
    actionPlan,
    previousExam: previousExam
      ? { examName: previousExam.exam_name, examDate: previousExam.exam_date }
      : null,
  }
}

export async function listExamReviewHistory(studentUserId, limit = 10) {
  if (!isSupabaseAdminConfigured() || !studentUserId) return []
  const admin = createServiceRoleClient()
  const { data, error } = await admin
    .from('exam_records')
    .select('id, exam_name, exam_date, scores_json, ai_report, action_plan, created_at')
    .eq('student_user_id', studentUserId)
    .order('exam_date', { ascending: false })
    .limit(limit)

  if (error) throw new Error(error.message)
  return data || []
}

export { LOSS_REASON_OPTIONS, CORE_SUBJECTS, DEFAULT_ELECTIVES }
