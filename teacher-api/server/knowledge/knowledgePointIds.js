/** 与 supabase/migrations/020 及 knowledge-base/subject-knowledge-tree.json 同步 */
export const KNOWLEDGE_CODE_TO_UUID = {
  'math-s3-ch01-kp01-ep01': 'a1000001-0001-4001-8001-000000001201',
  'math-s3-ch01-kp01-ep02': 'a1000001-0001-4001-8001-000000001202',
  'math-s3-ch02-kp03-ep01': 'a1000001-0001-4001-8001-000000002207',
}

const UUID_LABELS = {
  'a1000001-0001-4001-8001-000000001201': '集合的列举法与描述法',
  'a1000001-0001-4001-8001-000000001202': '子集与真子集',
  'a1000001-0001-4001-8001-000000002207': '单调区间与极值',
}

export function knowledgeIdsToLegacyString(ids = []) {
  if (!Array.isArray(ids) || !ids.length) return ''
  return ids.map((id) => UUID_LABELS[id] ?? id).join(' / ')
}

export function normalizeQuestionPayload(payload = {}) {
  const knowledge_point_ids = Array.isArray(payload.knowledge_point_ids)
    ? payload.knowledge_point_ids.filter(Boolean)
    : []
  const knowledge_point = payload.knowledge_point
    || knowledgeIdsToLegacyString(knowledge_point_ids)
    || ''
  return {
    ...payload,
    knowledge_point,
    knowledge_point_ids,
    analysis: sanitizeAnalysisText(payload.analysis),
    ability_dimension: payload.ability_dimension || '',
    suitable_stage: payload.suitable_stage || '',
    textbook_version: payload.textbook_version || '',
    estimated_time: payload.estimated_time != null && payload.estimated_time !== ''
      ? Number(payload.estimated_time)
      : null,
  }
}

function sanitizeAnalysisText(raw) {
  let s = String(raw ?? '').trim()
  if (!s) return ''
  s = s.replace(/<img\b[^>]*\/?>/gi, '[图片已移除，请改用 LaTeX/Markdown 描述]')
  s = s.replace(/!\[[^\]]*\]\([^)]+\)/g, '[图片已移除，请改用 LaTeX/Markdown 描述]')
  return s
}
