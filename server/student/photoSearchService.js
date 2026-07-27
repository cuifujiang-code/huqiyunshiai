import {
  recognizePhotoQuestionDoubao,
  isDoubaoVisionOcrConfigured,
} from '../doubaoVisionOcr.js'
import { callDeepSeekAI, extractJson, getDeepSeekConfig } from '../deepseekClient.js'
import { getSupabaseAdmin, isSupabaseAdminConfigured } from '../supabaseAdmin.js'
import { insertPhotoSearchRecord } from './photoSearchStore.js'
import {
  PHOTO_SEARCH_SYSTEM_PROMPT,
  enrichPhotoSearchResult,
  parseStructuredPhotoSearchJson,
} from './photoSearchPrompt.js'

const BANK_TABLES = [
  { table: 'teacher_question_bank', label: 'teacher' },
  { table: 'batch_question_bank', label: 'batch' },
]

function normalizeText(s) {
  return String(s || '')
    .replace(/\s+/g, '')
    .trim()
}

/** 从 OCR 文本提取用于题库检索的关键词 */
export function extractSearchKeyword(ocrText) {
  const cleaned = String(ocrText || '').replace(/\s+/g, ' ').trim()
  const segments = cleaned.match(/[\u4e00-\u9fa5a-zA-Z0-9·°²³√∫∑π]{6,}/g) || []
  const best = segments.sort((a, b) => b.length - a.length)[0]
  return (best || cleaned).slice(0, 48)
}

/** 简单文本相似度（公共子串占比） */
export function textSimilarity(a, b) {
  const sa = normalizeText(a)
  const sb = normalizeText(b)
  if (!sa || !sb) return 0
  if (sa.includes(sb) || sb.includes(sa)) return Math.min(sa.length, sb.length) / Math.max(sa.length, sb.length)

  const window = 8
  let hits = 0
  const steps = Math.max(1, Math.floor((sa.length - window) / 4) + 1)
  for (let i = 0; i < sa.length - window; i += 4) {
    if (sb.includes(sa.slice(i, i + window))) hits++
  }
  return Math.min(1, hits / steps)
}

export async function findSimilarBankQuestions(ocrText, limit = 5) {
  if (!isSupabaseAdminConfigured()) return []

  const keyword = extractSearchKeyword(ocrText)
  if (keyword.length < 6) return []

  const admin = getSupabaseAdmin()
  const collected = []

  for (const { table } of BANK_TABLES) {
    const { data, error } = await admin
      .from(table)
      .select('id, content, answer, analysis, knowledge_point, subject, question_type, options, difficulty')
      .eq('visibility', 'public')
      .ilike('content', `%${keyword}%`)
      .limit(limit)

    if (error) {
      console.warn('[photoSearch] 题库检索失败', { table, message: error.message })
      continue
    }

    for (const row of data ?? []) {
      collected.push({
        ...row,
        _table: table,
        _score: textSimilarity(ocrText, row.content),
      })
    }
  }

  return collected
    .sort((a, b) => b._score - a._score)
    .slice(0, limit)
}

const SYSTEM_PROMPT = PHOTO_SEARCH_SYSTEM_PROMPT

function buildUserPrompt(ocrText, candidates) {
  const parts = [`OCR 识别文字：\n${ocrText}`]
  if (candidates.length) {
    parts.push('\n题库候选题（优先选用最匹配者）：')
    candidates.forEach((q, i) => {
      parts.push(
        `\n[${i + 1}] id=${q.id} table=${q._table} 相似度=${(q._score * 100).toFixed(0)}%\n题干：${q.content}\n答案：${q.answer || '无'}\n解析：${q.analysis || '无'}\n知识点：${q.knowledge_point || '无'}`,
      )
    })
  }
  return parts.join('\n')
}

function mapBankHit(best, ocrText, candidates = []) {
  const kp = best.knowledge_point
    ? String(best.knowledge_point)
        .split(/[,，;；]/)
        .map((s) => s.trim())
        .filter(Boolean)
    : []

  return enrichPhotoSearchResult(
    {
      ocrText,
      question: best.content || ocrText,
      answer: best.answer || '暂无',
      analysis: best.analysis || '暂无',
      knowledgePoints: kp,
      source: 'bank',
      bankQuestionId: String(best.id),
      bankTable: best._table,
      matchedQuestion: {
        id: best.id,
        content: best.content,
        answer: best.answer,
        analysis: best.analysis,
        knowledge_point: best.knowledge_point,
        subject: best.subject,
        question_type: best.question_type,
        table: best._table,
      },
      similarity: best._score,
    },
    candidates.length ? candidates : [best],
  )
}

async function solveWithDeepSeek(ocrText, candidates) {
  const cfg = getDeepSeekConfig()
  if (!cfg.hasApiKey) {
    const best = candidates[0]
    if (best && best._score >= 0.35) return mapBankHit(best, ocrText)
    return {
      ocrText,
      question: ocrText,
      answer: '请配置 DEEPSEEK_API_KEY 后获取 AI 解答',
      analysis: '当前环境未配置 DeepSeek，无法在题库未命中时自动生成解析。',
      knowledgePoints: [],
      source: 'ai',
      bankQuestionId: null,
      bankTable: null,
      matchedQuestion: null,
      similarity: 0,
      isMockFallback: true,
    }
  }

  const raw = await callDeepSeekAI(SYSTEM_PROMPT, buildUserPrompt(ocrText, candidates), {
    label: 'PhotoSearch',
    timeoutMs: 55000,
  })

  let parsed
  try {
    parsed = JSON.parse(extractJson(raw))
  } catch {
    parsed = {
      question: ocrText,
      answer: raw.slice(0, 500),
      stepSolution: '',
      knowledgePoints: [],
      source: 'ai',
    }
  }

  return parseStructuredPhotoSearchJson(parsed, ocrText, candidates)
}

async function runPhotoSearchViaOrchestrator({ userId, imageBase64, imageName, clientOcrText, editedOcrText }) {
  const base = (
    process.env.TEACHER_API_URL ||
    process.env.VITE_TEACHER_API_URL ||
    'https://api.huqiyunshiai.online'
  ).replace(/\/$/, '')

  const response = await fetch(`${base}/api/ai/orchestrate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      taskType: 'photo-search',
      input: { userId, imageBase64, imageName, clientOcrText, editedOcrText },
    }),
    signal: AbortSignal.timeout(120000),
  })

  const text = await response.text()
  let data
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('拍照搜题编排 API 返回非 JSON')
  }

  if (!response.ok || !data.success) {
    throw new Error(data.error || data.message || `编排 API HTTP ${response.status}`)
  }

  return { ...data.result, orchestrated: true, meta: data.meta }
}

/**
 * 拍照搜题主流程：优先 teacher-api 多 AI 编排，失败则单 AI 降级
 */
export async function runPhotoSearch({ userId, imageBase64, imageName, clientOcrText, editedOcrText }) {
  const preOcr = (clientOcrText || editedOcrText || '').trim()
  if (!preOcr && !imageBase64?.trim()) {
    throw new Error('请上传题目图片')
  }

  if (process.env.USE_AI_ORCHESTRATOR !== 'false') {
    try {
      const orchestrated = await runPhotoSearchViaOrchestrator({
        userId,
        imageBase64,
        imageName,
        clientOcrText,
        editedOcrText,
      })
      let historyId = null
      try {
        const row = await insertPhotoSearchRecord({
          userId,
          imageName: imageName || 'photo.jpg',
          ocrText: orchestrated.ocrText,
          question: orchestrated.question,
          answer: orchestrated.answer,
          analysis: orchestrated.analysis,
          knowledgePoints: orchestrated.knowledgePoints,
          source: orchestrated.source,
          bankQuestionId: orchestrated.bankQuestionId,
          bankTable: orchestrated.bankTable ?? null,
          matchedQuestion: orchestrated.matchedQuestion ?? null,
        })
        historyId = row?.id ?? null
      } catch (err) {
        console.warn('[photoSearch] 历史记录保存失败', err)
      }
      return { ...orchestrated, historyId }
    } catch (orchErr) {
      console.warn('[photoSearch] 多 AI 编排失败，降级单 AI 模式', {
        message: orchErr instanceof Error ? orchErr.message : String(orchErr),
      })
    }
  }

  if (!isDoubaoVisionOcrConfigured()) {
    throw new Error('豆包视觉 OCR 未配置，请设置 DOUBAO_API_KEY 与 DOUBAO_VISION_MODEL')
  }

  let ocrText
  try {
    ocrText = await recognizePhotoQuestionDoubao(imageBase64, {
      fileName: imageName || 'photo.jpg',
    })
  } catch (ocrErr) {
    // OCR 服务调用失败（网络/认证等），归为识别失败
    console.error('[photoSearch] OCR 调用异常', ocrErr)
    throw Object.assign(new Error('图片字迹模糊无法识别，请重新拍照或选择更清晰的图片'), {
      searchStatus: 'blurry',
    })
  }

  if (normalizeText(ocrText).length < 8) {
    // OCR 返回文字过少 → 模糊
    throw Object.assign(new Error('图片字迹模糊无法识别，请重新拍照或选择更清晰的图片'), {
      searchStatus: 'blurry',
    })
  }

  const candidates = await findSimilarBankQuestions(ocrText)
  const best = candidates[0]

  let result
  if (best && best._score >= 0.55) {
    // 题库直接命中 → success
    result = { ...mapBankHit(best, ocrText, candidates), searchStatus: 'success' }
  } else {
    // AI 兜底
    const aiResult = await solveWithDeepSeek(ocrText, candidates)

    if (aiResult.isMockFallback && (!best || best._score < 0.35)) {
      // 题库无命中 + AI 不可用 → no_match
      result = { ...aiResult, searchStatus: 'no_match' }
    } else {
      result = { ...aiResult, searchStatus: 'success' }
    }
  }

  let historyId = null
  try {
    const row = await insertPhotoSearchRecord({
      userId,
      imageName: imageName || 'photo.jpg',
      ocrText: result.ocrText,
      question: result.question,
      answer: result.answer,
      analysis: result.analysis,
      knowledgePoints: result.knowledgePoints,
      source: result.source,
      bankQuestionId: result.bankQuestionId,
      bankTable: result.bankTable,
      matchedQuestion: result.matchedQuestion,
    })
    historyId = row?.id ?? null
  } catch (err) {
    console.warn('[photoSearch] 历史记录保存失败', err)
  }

  return { ...result, historyId }
}
