const VERSION_TABLE = 'question_versions'
const QUESTION_TABLE = 'teacher_question_bank'

export async function archiveQuestionVersion(admin, questionId, editorId, snapshot) {
  const { data: maxRow, error: maxErr } = await admin
    .from(VERSION_TABLE)
    .select('version_number')
    .eq('question_id', questionId)
    .order('version_number', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (maxErr) throw new Error(maxErr.message)

  const version_number = (maxRow?.version_number ?? 0) + 1
  const { error } = await admin.from(VERSION_TABLE).insert({
    question_id: questionId,
    version_number,
    content: snapshot.content ?? '',
    answer: snapshot.answer ?? '',
    analysis: snapshot.analysis ?? '',
    editor_id: editorId,
  })
  if (error) throw new Error(error.message)
  return version_number
}

export async function listQuestionVersions(admin, teacherId, questionId) {
  const { data: owned, error: ownErr } = await admin
    .from(QUESTION_TABLE)
    .select('id')
    .eq('id', questionId)
    .eq('teacher_id', teacherId)
    .maybeSingle()
  if (ownErr) throw new Error(ownErr.message)
  if (!owned) throw new Error('题目不存在或无权访问')

  const { data, error } = await admin
    .from(VERSION_TABLE)
    .select('id, question_id, version_number, content, answer, analysis, editor_id, created_at')
    .eq('question_id', questionId)
    .order('version_number', { ascending: false })
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function restoreQuestionVersion(admin, teacherId, questionId, versionId) {
  const { data: question, error: qErr } = await admin
    .from(QUESTION_TABLE)
    .select('id, content, answer, analysis')
    .eq('id', questionId)
    .eq('teacher_id', teacherId)
    .maybeSingle()
  if (qErr) throw new Error(qErr.message)
  if (!question) throw new Error('题目不存在或无权访问')

  const { data: version, error: vErr } = await admin
    .from(VERSION_TABLE)
    .select('*')
    .eq('id', versionId)
    .eq('question_id', questionId)
    .maybeSingle()
  if (vErr) throw new Error(vErr.message)
  if (!version) throw new Error('版本不存在')

  await archiveQuestionVersion(admin, questionId, teacherId, question)

  const now = new Date().toISOString()
  const { data: updated, error: uErr } = await admin
    .from(QUESTION_TABLE)
    .update({
      content: version.content ?? '',
      answer: version.answer ?? '',
      analysis: version.analysis ?? '',
      updated_at: now,
    })
    .eq('id', questionId)
    .eq('teacher_id', teacherId)
    .select('*')
    .single()
  if (uErr) throw new Error(uErr.message)
  return updated
}
