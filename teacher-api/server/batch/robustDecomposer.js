/**
 * 批量拆题 · 稳健拆题核心
 * 单一入口 forceDecomposeAndInsert：DeepSeek 拆题 → 清洗解析 → 标准化 → SERVICE_ROLE 入库 → 任务状态同步
 */
import { callDeepSeekAI, DeepSeekApiError } from '../deepseekClient.js'
import { createServiceRoleClient, getSupabaseAdmin } from '../supabaseAdmin.js'
import { normalizeQuestionsBatch } from './questionNormalizer.js'
import { countBatchQuestionsInBank } from './batchTaskStore.js'

const BANK = 'batch_question_bank'
const TASKS = 'batch_decompose_tasks'

const PRIMARY_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat'
const BACKUP_MODEL = process.env.DEEPSEEK_BATCH_MODEL || 'deepseek-v4-flash'
const MAX_TOKENS = Number(process.env.DEEPSEEK_BATCH_MAX_TOKENS || 8192)

const ROBUST_SYSTEM_PROMPT = '你是一个专业的题目解析器。只输出 JSON 数组，不输出任何其它内容。'

function buildRobustUserPrompt(text) {
  return `你是一个专业的题目解析器。请将以下文本中的题目逐题提取出来，返回一个严格的JSON数组。每道题必须包含以下字段：content(题目内容), answer(答案), analysis(解析), question_type(题型), difficulty(难度), knowledge_point(知识点)。不要输出任何其他文字，不要用markdown代码块包裹。如果无法提取，返回空数组[]。

${text}`
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
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
  if (!VALID_DIFFICULTY.has(difficulty)) difficulty = '中等'

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

async function callDecomposeAi(text, model, label) {
  const userPrompt = buildRobustUserPrompt(text)
  console.log('[robustDecomposer] 调用 DeepSeek', { model, label, textLength: text.length })

  const rawResponse = await callDeepSeekAI(ROBUST_SYSTEM_PROMPT, userPrompt, {
    model,
    maxTokens: MAX_TOKENS,
    label,
  })

  console.log('[robustDecomposer] 原始 AI 返回', {
    model,
    label,
    length: String(rawResponse ?? '').length,
    preview: String(rawResponse ?? '').slice(0, 500),
    full: rawResponse,
  })

  return rawResponse
}

const DECOMPOSE_MAX_RETRIES = Number(process.env.BATCH_DECOMPOSE_RETRIES || 2)

async function decomposeWithModels(text) {
  const models = [
    { model: PRIMARY_MODEL, label: 'robust-decompose-primary' },
    { model: BACKUP_MODEL, label: 'robust-decompose-backup' },
  ]

  // 去重：主备模型相同时只调一次
  const uniqueModels = models.filter((m, i, arr) => arr.findIndex((x) => x.model === m.model) === i)

  let lastError = null
  let lastRaw = ''

  // 外层重试循环：整个模型链重试 DECOMPOSE_MAX_RETRIES 次
  for (let retry = 0; retry < DECOMPOSE_MAX_RETRIES; retry++) {
    if (retry > 0) {
      const delayMs = 3000 + retry * 2000
      console.warn('[robustDecomposer] 第' + (retry + 1) + '次完整重试', {
        delayMs,
        textLength: text.length,
        previousError: lastError?.message ?? '无',
      })
      await sleep(delayMs)
    }

    for (let i = 0; i < uniqueModels.length; i++) {
      const { model, label } = uniqueModels[i]
      if (i > 0) {
        console.warn('[robustDecomposer] 模型切换重试', {
          backupModel: model,
          delayMs: 2000,
          retry,
        })
        await sleep(2000)
      }

      try {
        const rawResponse = await callDecomposeAi(text, model, label)
        lastRaw = rawResponse

        const { cleaned, arraySlice } = cleanAiResponseString(rawResponse)
        console.log('[robustDecomposer] 清洗后字符串', {
          model,
          retry,
          cleanedLength: cleaned.length,
          arraySliceLength: arraySlice?.length ?? 0,
          arrayPreview: arraySlice?.slice(0, 500) ?? cleaned.slice(0, 500),
        })

        if (!arraySlice) {
          lastError = new Error('清洗后未找到 JSON 数组边界')
          continue
        }

        const rawArray = parseJsonArrayWithFallback(arraySlice)
        console.log('[robustDecomposer] 解析后题目数', {
          model,
          retry,
          parsedCount: rawArray.length,
          firstQuestionPreview: rawArray[0] ? JSON.stringify(rawArray[0]).slice(0, 300) : '(空)',
        })

        if (rawArray.length > 0) {
          return { rawArray, rawResponse, model, arraySlice }
        }

        lastError = new Error('AI 返回空数组')
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err))
        console.error('[robustDecomposer] 模型调用/解析失败', {
          model,
          retry,
          message: lastError.message,
          isDeepSeek: err instanceof DeepSeekApiError,
        })
        // 不在内层 throw，继续尝试下一个模型或下一轮重试
      }
    }

    // 本轮所有模型都失败，记录后进入下一轮重试
    console.warn('[robustDecomposer] 第' + (retry + 1) + '轮全部模型失败', {
      lastError: lastError?.message ?? '未知',
      remainingRetries: DECOMPOSE_MAX_RETRIES - retry - 1,
    })
  }

  throw lastError || new Error('拆题失败：经 ' + DECOMPOSE_MAX_RETRIES + ' 轮重试，所有模型均未返回有效题目')
}

async function insertQuestionsToBank(batchId, teacherId, itemId, questions, taskMeta) {
  const admin = createServiceRoleClient()
  console.log('[robustDecomposer] Supabase 客户端已初始化（SERVICE_ROLE_KEY）', {
    batchId,
    teacherId,
    table: BANK,
  })

  const rows = questions.map((q, i) => normalizeBankInsertRow(q, batchId, teacherId, itemId, i, taskMeta))
  console.log('[robustDecomposer] 准备入库', {
    batchId,
    rowCount: rows.length,
    firstRowPreview: rows[0] ? JSON.stringify(rows[0]).slice(0, 400) : '(空)',
  })

  const { error, status, statusText } = await admin.from(BANK).insert(rows)

  if (error) {
    console.error('[robustDecomposer] 入库失败', {
      batchId,
      httpStatus: status,
      statusText,
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    })
    throw new Error(`batch_question_bank 入库失败: ${error.message}`)
  }

  console.log('[robustDecomposer] 入库成功', {
    batchId,
    insertedRows: rows.length,
    httpStatus: status,
  })

  return rows.length
}

async function syncTaskFromBankCount(batchId) {
  const realCount = await countBatchQuestionsInBank(batchId)
  const status = realCount > 0 ? 'completed' : 'failed'

  const admin = getSupabaseAdmin()
  const patch = {
    imported_questions: realCount,
    total_questions: realCount,
    status,
    updated_at: new Date().toISOString(),
  }

  if (status === 'failed') {
    patch.error_message = '稳健拆题未检测到入库题目（batch_question_bank count=0）'
  } else {
    patch.error_message = null
  }

  const { error } = await admin.from(TASKS).update(patch).eq('batch_id', batchId)
  if (error) {
    console.error('[robustDecomposer] 更新 batch_decompose_tasks 失败', {
      batchId,
      message: error.message,
    })
    throw new Error(error.message)
  }

  console.log('[robustDecomposer] 任务状态已同步', {
    batchId,
    imported_questions: realCount,
    status,
  })

  return { realCount, status }
}

/**
 * 稳健拆题并入库（主入口）
 * @param {string} batchId
 * @param {string} teacherId
 * @param {string} text 待拆题文本（分块或整卷）
 * @param {string} subject
 * @param {string} grade
 * @returns {Promise<{ success: boolean, insertedCount: number, parsedCount: number, questions: object[], realCount: number, status: string, error?: string, model?: string }>}
 */
export async function forceDecomposeAndInsert(batchId, teacherId, text, subject, grade) {
  const normalizedBatchId = String(batchId ?? '').trim()
  const normalizedTeacherId = String(teacherId ?? '').trim()
  const chunkText = String(text ?? '').trim()
  const taskMeta = { subject: subject || '数学', grade: grade || '八年级' }

  console.log('[robustDecomposer] === forceDecomposeAndInsert 开始 ===', {
    batchId: normalizedBatchId,
    teacherId: normalizedTeacherId,
    textLength: chunkText.length,
    subject: taskMeta.subject,
    grade: taskMeta.grade,
    primaryModel: PRIMARY_MODEL,
    backupModel: BACKUP_MODEL,
  })

  if (!normalizedBatchId || !normalizedTeacherId) {
    return { success: false, insertedCount: 0, parsedCount: 0, questions: [], realCount: 0, status: 'failed', error: '缺少 batchId 或 teacherId' }
  }

  if (!chunkText) {
    const synced = await syncTaskFromBankCount(normalizedBatchId).catch(() => ({ realCount: 0, status: 'failed' }))
    return {
      success: false,
      insertedCount: 0,
      parsedCount: 0,
      questions: [],
      realCount: synced.realCount ?? 0,
      status: synced.status ?? 'failed',
      error: '文本为空，无法拆题',
    }
  }

  try {
    const { rawArray, model } = await decomposeWithModels(chunkText)

    const startSort = await countBatchQuestionsInBank(normalizedBatchId)
    const { valid: normalizedQuestions, rawCount, filteredCount } = normalizeQuestionsBatch(
      rawArray,
      taskMeta,
      startSort,
    )

    console.log('[robustDecomposer] 标准化结果', {
      batchId: normalizedBatchId,
      rawCount,
      validCount: normalizedQuestions.length,
      filteredCount,
    })

    if (!normalizedQuestions.length) {
      const synced = await syncTaskFromBankCount(normalizedBatchId)
      return {
        success: false,
        insertedCount: 0,
        parsedCount: rawCount,
        questions: [],
        realCount: synced.realCount,
        status: synced.status,
        error: '解析成功但无有效题目（标准化后为空）',
        model,
      }
    }

    const insertedCount = await insertQuestionsToBank(
      normalizedBatchId,
      normalizedTeacherId,
      null,
      normalizedQuestions,
      taskMeta,
    )

    const { realCount, status } = await syncTaskFromBankCount(normalizedBatchId)

    console.log('[robustDecomposer] === forceDecomposeAndInsert 完成 ===', {
      batchId: normalizedBatchId,
      insertedCount,
      parsedCount: normalizedQuestions.length,
      realCount,
      status,
      model,
    })

    return {
      success: insertedCount > 0,
      insertedCount,
      parsedCount: normalizedQuestions.length,
      questions: normalizedQuestions,
      realCount,
      status,
      model,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[robustDecomposer] === forceDecomposeAndInsert 失败 ===', {
      batchId: normalizedBatchId,
      message: msg,
      stack: err instanceof Error ? err.stack : undefined,
    })

    let synced = { realCount: 0, status: 'failed' }
    try {
      synced = await syncTaskFromBankCount(normalizedBatchId)
    } catch (syncErr) {
      console.error('[robustDecomposer] 失败后同步任务状态也失败', {
        message: syncErr instanceof Error ? syncErr.message : String(syncErr),
      })
    }

    return {
      success: false,
      insertedCount: 0,
      parsedCount: 0,
      questions: [],
      realCount: synced.realCount ?? 0,
      status: synced.realCount > 0 ? synced.status : 'failed',
      error: msg,
    }
  }
}
