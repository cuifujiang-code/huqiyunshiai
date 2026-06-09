import { getSupabaseAdmin } from '../supabaseAdmin.js'
import { callDeepSeekAI } from '../deepseekClient.js'
import { repairJSON } from '../batch/jsonRepairEngine.js'

const TABLE = 'handouts'

function nowIso() {
  return new Date().toISOString()
}

export async function listHandouts(teacherId) {
  const admin = getSupabaseAdmin()
  const { data, error } = await admin
    .from(TABLE)
    .select('id, title, mode, student_id, created_at, updated_at')
    .eq('teacher_id', teacherId)
    .order('updated_at', { ascending: false })
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function getHandout(teacherId, id) {
  const admin = getSupabaseAdmin()
  const { data, error } = await admin.from(TABLE).select('*').eq('id', id).eq('teacher_id', teacherId).maybeSingle()
  if (error) throw new Error(error.message)
  return data
}

export async function saveHandout(teacherId, payload) {
  const admin = getSupabaseAdmin()
  const row = {
    teacher_id: teacherId,
    title: payload.title,
    mode: payload.mode,
    content: payload.content ?? {},
    student_id: payload.student_id || null,
    updated_at: nowIso(),
  }
  if (payload.id) {
    const { data, error } = await admin.from(TABLE).update(row).eq('id', payload.id).eq('teacher_id', teacherId).select('*').single()
    if (error) throw new Error(error.message)
    return data
  }
  const { data, error } = await admin.from(TABLE).insert(row).select('*').single()
  if (error) throw new Error(error.message)
  return data
}

export async function deleteHandout(teacherId, id) {
  const admin = getSupabaseAdmin()
  const { error } = await admin.from(TABLE).delete().eq('id', id).eq('teacher_id', teacherId)
  if (error) throw new Error(error.message)
}

const MODE_TEMPLATES = {
  school: ['课题标题', '教学目标', '知识梳理', '典型例题', '课堂练习', '课后作业'],
  tutoring: ['课题标题', '适用层次', '知识点模块', '综合练习', '本讲总结', '课后巩固'],
  targeted: ['学生信息', '薄弱点总览', '分知识点训练', '综合检测', '学习建议'],
  custom: ['知识点讲解', '例题', '练习', '总结'],
}

export async function generateKnowledgeSummary(input) {
  const { subject, grade, knowledgePoint, questions = [] } = input
  const qText = questions
    .slice(0, 15)
    .map((q, i) => `${i + 1}. ${String(q.content || q).slice(0, 200)}`)
    .join('\n')

  const prompt = `为${grade || ''}${subject || ''}「${knowledgePoint || '本讲知识点'}」撰写知识点总结（300-500字）。
${qText ? `参考题目：\n${qText}` : ''}
要求：条理清晰，含核心概念、常见考点、易错提醒。只输出正文，不要 markdown 标题。`

  return callDeepSeekAI('你是资深学科教师', prompt)
}

export async function generateHandoutDraft(mode, input) {
  const modules = MODE_TEMPLATES[mode] || MODE_TEMPLATES.school
  const prompt = `为${input.grade || ''}${input.subject || ''}生成「${input.title}」讲义草稿，模式：${mode}。
模块：${modules.join('、')}
${input.objectives ? `教学目标：${input.objectives}` : ''}
${input.weakPoints ? `薄弱点：${JSON.stringify(input.weakPoints)}` : ''}
${input.questionSummary ? `参考题目：${input.questionSummary.slice(0, 3000)}` : ''}
返回 JSON：{ title, modules: [{ id, title, content, items? }] }`
  const content = await callDeepSeekAI('只输出 JSON，不要 markdown', prompt)
  return repairJSON(content)
}
