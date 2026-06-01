/**
 * 批量拆题 · 稳健拆题核心
 * 单一入口 forceDecomposeAndInsert：DeepSeek 拆题 → 清洗解析 → 标准化 → SERVICE_ROLE 入库
 */
import { callDeepSeekAI, DeepSeekApiError } from '../deepseekClient.js'
import { createServiceRoleClient, getSupabaseAdmin } from '../supabaseAdmin.js'
import { countQuestionMarkers } from './batchChunker.js'
import {
  IMAGE_PLACEHOLDER_RULE,
  JSON_EXAMPLE_WITH_LATEX,
  LATEX_STRICT_RULE,
} from './batchQualityPrompts.js'
import { normalizeQuestionsBatch } from './questionNormalizer.js'
import { countBatchQuestionsInBank } from './batchTaskStore.js'

const BANK = 'batch_question_bank'
const TASKS = 'batch_decompose_tasks'

const PRIMARY_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat'
let BACKUP_MODEL = process.env.DEEPSEEK_BATCH_MODEL || 'deepseek-v4-flash'
if (BACKUP_MODEL === PRIMARY_MODEL) {
  BACKUP_MODEL = PRIMARY_MODEL.includes('flash') ? 'deepseek-chat' : 'deepseek-v4-flash'
}

const MAX_TOKENS = Number(process.env.DEEPSEEK_BATCH_MAX_TOKENS || 8192)
const AI_TIMEOUT_MS = Number(process.env.DEEPSEEK_BATCH_TIMEOUT_MS || 55000)
const MIN_MEANINGFUL_CHUNK = Number(process.env.BATCH_MIN_CHUNK_LEN || 150)
const DECOMPOSE_MAX_RETRIES = Number(process.env.BATCH_DECOMPOSE_RETRIES || 2)

const ROBUST_SYSTEM_PROMPT = `你是一个专业的题目解析器。只输出 JSON 数组，不输出任何其它内容。
${LATEX_STRICT_RULE}
${IMAGE_PLACEHOLDER_RULE}`

function buildRobustUserPrompt(text) {
  return `你是一个专业的题目解析器。请将以下文本中的题目逐题提取出来，返回一个严格的JSON数组。

${LATEX_STRICT_RULE}

${IMAGE_PLACEHOLDER_RULE}

每道题必须包含以下字段：content(题目内容), answer(答案), analysis(解析), question_type(题型), difficulty(难度), knowledge_point(知识点)。
不要输出任何其他文字，不要用markdown代码块包裹。如果无法提取，返回空数组[]。

JSON 格式示例：
${JSON_EXAMPLE_WITH_LATEX}

待处理文本：
${text}`
}

function buildFragmentUserPrompt(text) {
  return `你是一个专业的题目解析器。以下文本是试卷 OCR/PDF 提取后的**片段**，可能只有半道题、续篇、页眉页脚或答案区。请尽可能从中提取完整题目；若确实无任何题目信息，返回空数组[]。

${LATEX_STRICT_RULE}

${IMAGE_PLACEHOLDER_RULE}

每道题必须包含：content, answer, analysis, question_type, difficulty, knowledge_point。
只输出 JSON 数组，不要 markdown 代码块。

JSON 格式示例：
${JSON_EXAMPLE_WITH_LATEX}

文本片段：
${text}`
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** 极短且无题号标记的块，多为 PDF 切分噪声 */
export function isLikelyNonQuestionFragment(text) {
  const s = String(text ?? '').trim()
  if (!s) return true
  if (s.length >= 280) return false
  if (countQuestionMarkers(s) >= 1) return false
  if (s.length < MIN_MEANINGFUL_CHUNK) return true
  if (/^\[?(答案|解析|参考答案|考点)/.test(s)) return true
  if (/^第\s*\d+\s*页/.test(s)) return true
  return false
}

/** 移除 markdown 代码块标记，提取第一个 '[' 到最后一个 ']' */
export function cleanAiResponseString(raw) {
  let s = String(raw ?? '').trim()
  s = s.replace(/```json\s*/gi, '').replace(/```JSON\s*/gi, '').replace(/```\s*/g, '')
  const first = s.indexOf('[')
  const last = s.lastIndexOf(']')
  if (first === -1 || last === -1 || last <= first) {
    return { cleaned: s, arraySlice: null }
  }
  return { cleaned: s, arraySlice: s.slice(first, last + 1) }
}

/** JSON.parse 失败时使用 Function 构造器回退 */
export function parseJsonArrayWithFallback(jsonStr) {
  const str = String(jsonStr ?? '').trim()
  if (!str) return []

  try {
    const parsed = JSON.parse(str)
    return coerceToQuestionArray(parsed)
  } catch (jsonErr) {
    console.warn('[robustDecomposer] JSON.parse 失败，尝试 Function 构造器回退', {
      message: jsonErr instanceof Error ? jsonErr.message : String(jsonErr),
      preview: str.slice(0, 300),
    })
  }

  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function(`return (${str})`)
    const parsed = fn()
    return coerceToQuestionArray(parsed)
  } catch (fnErr) {
    const msg = fnErr instanceof Error ? fnErr.message : String(fnErr)
    throw new Error(`JSON 解析失败（含 Function 回退）: ${msg}`)
  }
}

function coerceToQuestionArray(parsed) {
  if (Array.isArray(parsed)) return parsed
  if (parsed && typeof parsed === 'object') {
    for (const key of ['questions', 'data', 'items', 'result', 'list']) {
      if (Array.isArray(parsed[key])) return parsed[key]
    }
  }
  return []
}

function normalizeBankInsertRow(q, batchId, teacherId, itemId, fallbackIndex, taskMeta = {}) {
  const sortOrder = Number.isFinite(Number(q?.sort_order))
    ? Math.max(1, Number(q.sort_order))
    : fallbackIndex + 1

  const VALID_TYPES = new Set(['选择题', '填空题', '计算题', '证明题', '实验题', '应用题'])
  const VALID_DIFFICULTY = new Set(['基础', '中等', '拔高'])

  let questionType = String(q?.question_type ?? q?.type ?? '').trim() || '应用题'
  if (!VALID_TYPES.has(questionType)) questionType = '应用题'

  let difficulty = String(q?.difficulty ?? '').trim() || '中等'
  if (/拔高|困难|难/.test(difficulty)) difficulty = '拔高'
  else if (/基础|简单|易/.test(difficulty)) difficulty = '基础'
  else if (!VALID_DIFFICULTY.has(difficulty)) difficulty = '中等'

  const optionsRaw = q?.options ?? q?.choices ?? []
  const options = Array.isArray(optionsRaw)
    ? optionsRaw.map((o) => String(o ?? '').trim()).filter(Boolean)
    : []

  const latexRaw = q?.latex_blocks ?? q?.latexBlocks ?? []
  const latexBlocks = Array.isArray(latexRaw)
    ? latexRaw.map((b) => String(b ?? '').trim()).filter(Boolean)
    : []

  const tagsRaw = q?.tags ?? []
  const tags = Array.isArray(tagsRaw)
    ? tagsRaw.map((t) => String(t ?? '').trim()).filter(Boolean)
    : []

  return {
    batch_id: batchId,
    teacher_id: teacherId,
    item_id: itemId ?? null,
    subject: String(q?.subject ?? taskMeta.subject ?? '').trim() || '数学',
    grade: String(q?.grade ?? taskMeta.grade ?? '').trim() || '八年级',
    knowledge_point: String(q?.knowledge_point ?? q?.knowledgePoint ?? '').trim() || '未分类',
    question_type: questionType,
    difficulty,
    content: String(q?.content ?? q?.question ?? q?.title ?? '').trim() || `题目 ${sortOrder}`,
    options,
    answer: String(q?.answer ?? q?.correct_answer ?? '').trim() || '暂无',
    analysis: String(q?.analysis ?? q?.explanation ?? '').trim() || '暂无',
    geometry_desc: String(q?.geometry_desc ?? q?.geometryDesc ?? '').trim() || '',
    latex_blocks: latexBlocks,
    source: '批量拆题',
    tags,
    sort_order: sortOrder,
    question_number: String(q?.question_number ?? q?.questionNumber ?? sortOrder),
  }
}

async function callDecomposeAi(text, model, label, useFragmentPrompt = false) {
  const userPrompt = useFragmentPrompt ? buildFragmentUserPrompt(text) : buildRobustUserPrompt(text)
  console.log('[robustDecomposer] 调用 DeepSeek', {
    model,
    label,
    textLength: text.length,
    fragmentMode: useFragmentPrompt,
    timeoutMs: AI_TIMEOUT_MS,
  })

  const rawResponse = await callDeepSeekAI(ROBUST_SYSTEM_PROMPT, userPrompt, {
    model,
    maxTokens: MAX_TOKENS,
    timeoutMs: AI_TIMEOUT_MS,
    label,
  })

  console.log('[robustDecomposer] 原始 AI 返回', {
    model,
    label,
    fragmentMode: useFragmentPrompt,
    length: String(rawResponse ?? '').length,
    preview: String(rawResponse ?? '').slice(0, 500),
    full: rawResponse,
  })

  return rawResponse
}

function parseAiResponse(rawResponse, model, retry, fragmentMode) {
  const { cleaned, arraySlice } = cleanAiResponseString(rawResponse)
  console.log('[robustDecomposer] 清洗后字符串', {
    model,
    retry,
    fragmentMode,
    cleanedLength: cleaned.length,
    arraySliceLength: arraySlice?.length ?? 0,
    arrayPreview: arraySlice?.slice(0, 500) ?? cleaned.slice(0, 500),
  })

  if (!arraySlice) {
    return { rawArray: [], error: new Error('清洗后未找到 JSON 数组边界') }
  }

  const rawArray = parseJsonArrayWithFallback(arraySlice)
  console.log('[robustDecomposer] 解析后题目数', {
    model,
    retry,
    fragmentMode,
    parsedCount: rawArray.length,
    firstQuestionPreview: rawArray[0] ? JSON.stringify(rawArray[0]).slice(0, 300) : '(空)',
  })

  return { rawArray }
}

async function decomposeWithModels(text) {
  const models = [
    { model: PRIMARY_MODEL, label: 'robust-decompose-primary' },
    { model: BACKUP_MODEL, label: 'robust-decompose-backup' },
  ]
  const uniqueModels = models.filter((m, i, arr) => arr.findIndex((x) => x.model === m.model) === i)

  let lastError = null
  const tryFragmentPrompt = isLikelyNonQuestionFragment(text) || text.length < 300

  for (let retry = 0; retry < DECOMPOSE_MAX_RETRIES; retry++) {
    if (retry > 0) {
      const delayMs = 2000 + retry * 1500
      console.warn('[robustDecomposer] 第' + (retry + 1) + '次完整重试', {
        delayMs,
        textLength: text.length,
        previousError: lastError?.message ?? '无',
      })
      await sleep(delayMs)
    }

    const promptModes = tryFragmentPrompt ? [false, true] : [false]

    for (const fragmentMode of promptModes) {
      for (let i = 0; i < uniqueModels.length; i++) {
        const { model, label } = uniqueModels[i]
        if (i > 0 || fragmentMode) {
          await sleep(1500)
        }

        try {
          const rawResponse = await callDecomposeAi(text, model, label, fragmentMode)
          const { rawArray, error } = parseAiResponse(rawResponse, model, retry, fragmentMode)

          if (error) {
            lastError = error
            continue
          }

          if (rawArray.length > 0) {
            return { rawArray, model, fragmentMode }
          }

          lastError = new Error('AI 返回空数组')
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err))
          console.error('[robustDecomposer] 模型调用/解析失败', {
            model,
            retry,
            fragmentMode,
            message: lastError.message,
            isDeepSeek: err instanceof DeepSeekApiError,
          })
        }
      }
    }

    console.warn('[robustDecomposer] 第' + (retry + 1) + '轮全部模型失败', {
      lastError: lastError?.message ?? '未知',
      remainingRetries: DECOMPOSE_MAX_RETRIES - retry - 1,
    })
  }

  if (isLikelyNonQuestionFragment(text)) {
    console.log('[robustDecomposer] 判定为 PDF 切分噪声片段，跳过', {
      textLength: text.length,
      preview: text.slice(0, 80),
    })
    return { rawArray: [], model: null, skippedFragment: true }
  }

  throw lastError || new Error('拆题失败：经 ' + DECOMPOSE_MAX_RETRIES + ' 轮重试，所有模型均未返回有效题目')
}

async function insertQuestionsToBank(batchId, teacherId, itemId, questions, taskMeta) {
  const admin = createServiceRoleClient()
  console.log('[robustDecomposer] Supabase 客户端已初始化（SERVICE_ROLE_KEY）', {
    batchId,
    teacherId,
    itemId,
    table: BANK,
  })

  const rows = questions.map((q, i) => normalizeBankInsertRow(q, batchId, teacherId, itemId, i, taskMeta))
  console.log('[robustDecomposer] 准备入库', {
    batchId,
    itemId,
    rowCount: rows.length,
    firstRowPreview: rows[0] ? JSON.stringify(rows[0]).slice(0, 400) : '(空)',
  })

  const { error, status, statusText } = await admin.from(BANK).insert(rows)

  if (error) {
    console.error('[robustDecomposer] 入库失败', {
      batchId,
      itemId,
      httpStatus: status,
      statusText,
      message: error.message,
      code: error.code,
    })
    throw new Error(`batch_question_bank 入库失败: ${error.message}`)
  }

  console.log('[robustDecomposer] 入库成功', {
    batchId,
    itemId,
    insertedRows: rows.length,
    httpStatus: status,
  })

  return rows.length
}

/** 分块处理期间仅同步题目数，不修改任务 status（由 worker 收尾） */
async function syncImportedQuestionsOnly(batchId) {
  const realCount = await countBatchQuestionsInBank(batchId)
  const admin = getSupabaseAdmin()
  const { error } = await admin.from(TASKS).update({
    imported_questions: realCount,
    total_questions: realCount,
    updated_at: new Date().toISOString(),
  }).eq('batch_id', batchId)

  if (error) {
    console.error('[robustDecomposer] 同步 imported_questions 失败', { batchId, message: error.message })
    throw new Error(error.message)
  }

  console.log('[robustDecomposer] 已同步 imported_questions（未改 status）', {
    batchId,
    imported_questions: realCount,
  })

  return realCount
}

/**
 * 稳健拆题并入库（主入口）
 * @param {object} [options] itemId: 分块 ID；skipStatusSync: 默认 true
 */
export async function forceDecomposeAndInsert(batchId, teacherId, text, subject, grade, options = {}) {
  const normalizedBatchId = String(batchId ?? '').trim()
  const normalizedTeacherId = String(teacherId ?? '').trim()
  const chunkText = String(text ?? '').trim()
  const itemId = options.itemId ?? null
  const taskMeta = { subject: subject || '数学', grade: grade || '八年级' }

  console.log('[robustDecomposer] === forceDecomposeAndInsert 开始 ===', {
    batchId: normalizedBatchId,
    teacherId: normalizedTeacherId,
    itemId,
    textLength: chunkText.length,
    subject: taskMeta.subject,
    grade: taskMeta.grade,
    primaryModel: PRIMARY_MODEL,
    backupModel: BACKUP_MODEL,
    likelyFragment: isLikelyNonQuestionFragment(chunkText),
  })

  if (!normalizedBatchId || !normalizedTeacherId) {
    return {
      success: false, insertedCount: 0, parsedCount: 0, questions: [],
      realCount: 0, status: 'failed', error: '缺少 batchId 或 teacherId',
    }
  }

  if (!chunkText) {
    return {
      success: false, insertedCount: 0, parsedCount: 0, questions: [],
      realCount: 0, status: 'failed', error: '文本为空，无法拆题', skipped: true,
    }
  }

  try {
    const decomposeResult = await decomposeWithModels(chunkText)

    if (decomposeResult.skippedFragment) {
      const realCount = await syncImportedQuestionsOnly(normalizedBatchId).catch(() => 0)
      return {
        success: true,
        skipped: true,
        skippedFragment: true,
        insertedCount: 0,
        parsedCount: 0,
        questions: [],
        realCount,
        status: 'running',
        model: null,
      }
    }

    const { rawArray, model } = decomposeResult
    const startSort = await countBatchQuestionsInBank(normalizedBatchId)
    const { valid: normalizedQuestions, rawCount, filteredCount } = normalizeQuestionsBatch(
      rawArray,
      taskMeta,
      startSort,
    )

    console.log('[robustDecomposer] 标准化结果', {
      batchId: normalizedBatchId,
      itemId,
      rawCount,
      validCount: normalizedQuestions.length,
      filteredCount,
    })

    if (!normalizedQuestions.length) {
      const realCount = await syncImportedQuestionsOnly(normalizedBatchId).catch(() => 0)
      return {
        success: false,
        insertedCount: 0,
        parsedCount: rawCount,
        questions: [],
        realCount,
        status: 'running',
        error: '解析成功但无有效题目（标准化后为空）',
        model,
      }
    }

    const insertedCount = await insertQuestionsToBank(
      normalizedBatchId,
      normalizedTeacherId,
      itemId,
      normalizedQuestions,
      taskMeta,
    )

    const realCount = await syncImportedQuestionsOnly(normalizedBatchId)

    console.log('[robustDecomposer] === forceDecomposeAndInsert 完成 ===', {
      batchId: normalizedBatchId,
      itemId,
      insertedCount,
      parsedCount: normalizedQuestions.length,
      realCount,
      model,
    })

    return {
      success: insertedCount > 0,
      insertedCount,
      parsedCount: normalizedQuestions.length,
      questions: normalizedQuestions,
      realCount,
      status: 'running',
      model,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[robustDecomposer] === forceDecomposeAndInsert 失败 ===', {
      batchId: normalizedBatchId,
      itemId,
      message: msg,
      stack: err instanceof Error ? err.stack : undefined,
    })

    const realCount = await syncImportedQuestionsOnly(normalizedBatchId).catch(() => 0)

    return {
      success: false,
      insertedCount: 0,
      parsedCount: 0,
      questions: [],
      realCount,
      status: 'running',
      error: msg,
    }
  }
}
