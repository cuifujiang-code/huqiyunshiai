/**
 * 批量拆题 · 稳健拆题核心
 * 单一入口 forceDecomposeAndInsert：DeepSeek 拆题 → 清洗解析 → 标准化 → SERVICE_ROLE 入库
 */
import { callDeepSeekAI, DeepSeekApiError } from '../deepseekClient.js'
import { createServiceRoleClient, getSupabaseAdmin } from '../supabaseAdmin.js'
import {
  backupPrompt,
  BATCH_SYSTEM_PROMPT,
  buildBatchSplitPrompt,
  parseBatchSplitAiResponse,
} from './batchPrompt.js'
import { countQuestionMarkers } from './batchChunker.js'
import {
  COMPLETE_EXTRACTION_RULE,
  FORMULA_PLACEHOLDER,
  IMAGE_PLACEHOLDER_RULE,
  JSON_EXAMPLE_WITH_LATEX,
  LATEX_STRICT_RULE,
} from './batchQualityPrompts.js'
import { filterCompleteQuestions } from './questionCompleteness.js'
import { normalizeQuestionsBatch, normalizeQuestionType } from './questionNormalizer.js'
import { repairJSON } from './jsonRepairEngine.js'
import { countBatchQuestionsInBank } from './batchTaskStore.js'

const BANK = 'batch_question_bank'
const TASKS = 'batch_decompose_tasks'

const PRIMARY_MODEL = process.env.DEEPSEEK_BATCH_PRIMARY_MODEL
  || (String(process.env.DEEPSEEK_MODEL || '').includes('flash') ? 'deepseek-chat' : (process.env.DEEPSEEK_MODEL || 'deepseek-chat'))
let BACKUP_MODEL = process.env.DEEPSEEK_BATCH_MODEL || 'deepseek-v4-flash'
if (BACKUP_MODEL === PRIMARY_MODEL) {
  BACKUP_MODEL = PRIMARY_MODEL.includes('flash') ? 'deepseek-chat' : 'deepseek-v4-flash'
}

const MAX_TOKENS = Number(process.env.DEEPSEEK_BATCH_MAX_TOKENS || 8192)
const AI_TIMEOUT_MS = Number(process.env.DEEPSEEK_BATCH_TIMEOUT_MS || 120000)
const MIN_MEANINGFUL_CHUNK = Number(process.env.BATCH_MIN_CHUNK_LEN || 150)
const DECOMPOSE_MAX_RETRIES = Number(process.env.BATCH_DECOMPOSE_RETRIES || 3)
const EXTRACT_TEMPERATURE = Number(process.env.DEEPSEEK_BATCH_TEMPERATURE || 0.15)

const ROBUST_SYSTEM_PROMPT = `你是一个专业的题目解析器。只输出 JSON 数组，不输出任何其它内容。

【最高优先级：题目完整性】
- 一道大题 = 一个 JSON 对象，无论包含多少子问题(1)(2)(3)…都不拆分
- 独立大题编号：1. 2. 3. …（"数字+."开头是新大题）
- 大题内子问题：(1) (2) (3) 或 ① ② ③ — 这些属于同一道大题
- 示例：「1. 已知… (1)求… (2)证明…」→ 1个对象，不要拆成2个

${COMPLETE_EXTRACTION_RULE}

${LATEX_STRICT_RULE}

文本中的 ${FORMULA_PLACEHOLDER} 标记代表 MathType 公式占位符。你必须根据上下文推断公式内容并替换为 LaTeX，禁止保留 ${FORMULA_PLACEHOLDER} 标记本身。

${IMAGE_PLACEHOLDER_RULE}`

function buildRobustUserPrompt(text, expectedCount = 0) {
  const countHint = expectedCount > 0
    ? `\n本片段约含 ${expectedCount} 道大题（题号 1. 2. 3. …）。注意：每道大题可能有多个子问题(1)(2)(3)，这些子问题必须放在同一个JSON对象中，不要拆分。JSON数组长度应等于独立大题数量（${expectedCount}个），禁止将子问题拆成多道题。\n`
    : '\n注意：每道大题可能包含多个子问题(1)(2)(3)，这些子问题属于同一道大题，必须放在同一个JSON对象中。禁止按子问题编号拆分。\n'

  return `你是一个专业的题目解析器。请将以下文本中的题目逐题完整提取，返回一个严格的JSON数组。
${countHint}
${COMPLETE_EXTRACTION_RULE}

文本中的 ${FORMULA_PLACEHOLDER} 标记代表原始文档的公式占位符。你必须根据上下文推断每个 ${FORMULA_PLACEHOLDER} 的实际公式内容，并替换为标准 LaTeX 格式。禁止在输出中保留 ${FORMULA_PLACEHOLDER} 标记。

${LATEX_STRICT_RULE}

${IMAGE_PLACEHOLDER_RULE}

每道题必须包含：content(完整题干，含所有子问题), answer(答案), analysis(解析), question_type, difficulty, knowledge_point。
选择题必须包含 options 数组，每项为 "A. 完整选项文字" 格式。
不要输出任何其他文字，不要用markdown代码块包裹。
文本中只要有题号或题干内容，禁止返回空数组 []。

【重要】如果文本中一道大题包含(1)(2)(3)子问题，所有子问题必须在同一个对象的content字段中，不要拆成多个对象。

JSON 格式示例：
${JSON_EXAMPLE_WITH_LATEX}

待处理文本：
${text}`
}

function buildMandatoryUserPrompt(text, expectedCount = 0) {
  return `【强制提取模式 - 禁止返回空数组】
以下文本来自试卷，一定包含题目。你必须输出至少 ${Math.max(1, expectedCount || 1)} 道题的 JSON 数组。
禁止返回 []。即使含 ${FORMULA_PLACEHOLDER} 占位符，也必须输出完整题目并用 LaTeX 推断公式。
每道题含 content、answer、analysis、question_type、difficulty、knowledge_point；选择题含 options。

文本：
${text}`
}

function buildFragmentUserPrompt(text) {
  return `你是一个专业的题目解析器。以下文本是试卷 OCR/PDF 提取后的**片段**，可能只有半道题、续篇、页眉页脚或答案区。请尽可能从中提取完整题目；若确实无任何题目信息，返回空数组[]。

文本中的 ${FORMULA_PLACEHOLDER} 标记代表原始文档的公式占位符。你必须根据上下文推断每个 ${FORMULA_PLACEHOLDER} 的实际公式内容，并替换为标准 LaTeX 格式。禁止在输出中保留 ${FORMULA_PLACEHOLDER} 标记。

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

/** JSON 解析：jsonRepairEngine 终极修复 */
export function parseJsonArrayWithFallback(jsonStr) {
  const str = String(jsonStr ?? '').trim()
  if (!str) return []

  try {
    const parsed = repairJSON(str)
    return coerceToQuestionArray(parsed)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    // 尝试从错误消息中提取失败位置
    const posMatch = msg.match(/position\s*(\d+)/i)
    const errorPosition = posMatch ? Number(posMatch[1]) : 3448
    const ctxStart = Math.max(0, errorPosition - 200)
    const ctxEnd = Math.min(str.length, errorPosition + 200)
    const errorContext = str.slice(ctxStart, ctxEnd)
    const pointer = ' '.repeat(Math.min(200, errorPosition - ctxStart)) + '▲ HERE (pos ' + errorPosition + ')'

    console.error('[robustDecomposer] repairJSON 失败', {
      message: msg,
      totalLength: str.length,
      errorPosition,
      previewHead: str.slice(0, 300),
      previewTail: str.slice(Math.max(0, str.length - 300)),
      errorContext: errorContext,
      errorPointer: pointer,
    })
    const wrapped = new Error(`拆题 JSON 解析失败: ${msg} [位置${errorPosition}/${str.length}，上下文: ${errorContext.slice(0, 100)}...]`)
    wrapped.cause = err
    wrapped.rawPreview = str.slice(0, 1000)
    throw wrapped
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

  const VALID_DIFFICULTY = new Set(['基础', '中等', '拔高'])

  const questionType = normalizeQuestionType(q) || '应用题'

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

async function callDecomposeAi(text, model, label, promptMode = 'primary') {
  const expectedCount = countQuestionMarkers(text)
  let userPrompt
  if (promptMode === 'fragment') {
    userPrompt = buildFragmentUserPrompt(text)
  } else if (promptMode === 'mandatory') {
    userPrompt = buildMandatoryUserPrompt(text, expectedCount)
  } else {
    userPrompt = buildRobustUserPrompt(text, expectedCount)
  }

  console.log('[robustDecomposer] 调用 DeepSeek', {
    model,
    label,
    textLength: text.length,
    promptMode,
    expectedCount,
    timeoutMs: AI_TIMEOUT_MS,
  })

  const rawResponse = await callDeepSeekAI(ROBUST_SYSTEM_PROMPT, userPrompt, {
    model,
    maxTokens: MAX_TOKENS,
    timeoutMs: AI_TIMEOUT_MS,
    temperature: EXTRACT_TEMPERATURE,
    label,
  })

  console.log('[robustDecomposer] 原始 AI 返回', {
    model,
    label,
    promptMode,
    length: String(rawResponse ?? '').length,
    preview: String(rawResponse ?? '').slice(0, 500),
    full: rawResponse,
  })

  return rawResponse
}

function parseAiResponse(rawResponse, model, retry, promptMode) {
  const { cleaned, arraySlice } = cleanAiResponseString(rawResponse)
  console.log('[robustDecomposer] 清洗后字符串', {
    model,
    retry,
    promptMode,
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
    promptMode,
    parsedCount: rawArray.length,
    firstQuestionPreview: rawArray[0] ? JSON.stringify(rawArray[0]).slice(0, 300) : '(空)',
  })

  return { rawArray }
}

/** 空数组时的备用：legacy batchPrompt 解析链路 */
async function decomposeWithLegacyPrompt(text, taskMeta) {
  const meta = {
    subject: taskMeta.subject || '数学',
    grade: taskMeta.grade || '八年级',
    estimatedQuestions: countQuestionMarkers(text),
  }
  const models = [PRIMARY_MODEL, BACKUP_MODEL].filter((m, i, a) => a.indexOf(m) === i)

  for (const model of models) {
    for (const useBackup of [false, true]) {
      const prompt = useBackup ? backupPrompt(text, meta) : buildBatchSplitPrompt(text, meta)
      const label = useBackup ? 'legacy-backup' : 'legacy-primary'
      try {
        console.log('[robustDecomposer] legacy prompt 回退', { model, label, textLength: text.length })
        const aiResponse = await callDeepSeekAI(BATCH_SYSTEM_PROMPT, prompt, {
          model,
          maxTokens: MAX_TOKENS,
          timeoutMs: AI_TIMEOUT_MS,
          temperature: EXTRACT_TEMPERATURE,
          label: `robust-${label}`,
        })
        const parsed = await parseBatchSplitAiResponse(aiResponse, meta, 0)
        if (parsed.questions?.length) {
          return { rawArray: parsed.questions, model, fragmentMode: label }
        }
      } catch (err) {
        console.warn('[robustDecomposer] legacy prompt 失败', {
          model,
          label,
          message: err instanceof Error ? err.message : String(err),
        })
      }
      await sleep(1000)
    }
  }

  return { rawArray: [], model: null, fragmentMode: 'legacy-failed' }
}

async function tryDecomposeOnce(text, model, label, promptMode, retry) {
  const rawResponse = await callDecomposeAi(text, model, label, promptMode)
  const { rawArray, error } = parseAiResponse(rawResponse, model, retry, promptMode)
  if (error) return { ok: false, error }
  if (rawArray.length > 0) {
    return { ok: true, rawArray, model, promptMode }
  }
  return { ok: false, error: new Error('AI 返回空数组') }
}

async function decomposeWithModels(text, taskMeta = {}) {
  const models = [
    { model: PRIMARY_MODEL, label: 'robust-decompose-primary' },
    { model: BACKUP_MODEL, label: 'robust-decompose-backup' },
  ]
  const uniqueModels = models.filter((m, i, arr) => arr.findIndex((x) => x.model === m.model) === i)
  const markerCount = countQuestionMarkers(text)
  const hasQuestions = markerCount >= 1 || text.length >= 300

  let lastError = null

  // prompt 模式顺序：标准 → 强制（有题号时）→ 片段（仅噪声块）
  const promptModes = hasQuestions
    ? ['primary', 'mandatory']
    : (isLikelyNonQuestionFragment(text) ? ['primary', 'fragment'] : ['primary', 'mandatory'])

  for (let retry = 0; retry < DECOMPOSE_MAX_RETRIES; retry++) {
    if (retry > 0) {
      const delayMs = 2000 + retry * 1500
      console.warn('[robustDecomposer] 第' + (retry + 1) + '次完整重试', {
        delayMs,
        textLength: text.length,
        markerCount,
        previousError: lastError?.message ?? '无',
      })
      await sleep(delayMs)
    }

    for (const promptMode of promptModes) {
      for (let i = 0; i < uniqueModels.length; i++) {
        const { model, label } = uniqueModels[i]
        if (i > 0) await sleep(1500)

        try {
          const result = await tryDecomposeOnce(text, model, label, promptMode, retry)
          if (result.ok) {
            return {
              rawArray: result.rawArray,
              model: result.model,
              promptMode: result.promptMode,
            }
          }
          lastError = result.error ?? new Error('未知错误')

          // 空数组且仍有题号：同模型立即试 mandatory
          if (promptMode === 'primary' && markerCount >= 1) {
            const mandatory = await tryDecomposeOnce(text, model, label, 'mandatory', retry)
            if (mandatory.ok) {
              return {
                rawArray: mandatory.rawArray,
                model: mandatory.model,
                promptMode: 'mandatory',
              }
            }
            lastError = mandatory.error ?? lastError
          }
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err))
          console.error('[robustDecomposer] 模型调用/解析失败', {
            model,
            retry,
            promptMode,
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

  // legacy batchPrompt 最后兜底
  if (hasQuestions) {
    console.warn('[robustDecomposer] 启用 legacy batchPrompt 兜底', { markerCount, textLength: text.length })
    const legacy = await decomposeWithLegacyPrompt(text, taskMeta)
    if (legacy.rawArray.length > 0) {
      return legacy
    }
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
  const taskMeta = {
    subject: subject || '数学',
    grade: grade || '八年级',
    // 预提取的图片映射
    formulaImages: options.formulaImages || options.formula_images || [],
    images: options.images || options.extracted_images || [],
  }

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
    const decomposeResult = await decomposeWithModels(chunkText, taskMeta)

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
    const { valid: normalizedRaw, rawCount, filteredCount } = normalizeQuestionsBatch(
      rawArray,
      taskMeta,
      startSort,
    )

    const normalizedQuestions = filterCompleteQuestions(normalizedRaw)

    console.log('[robustDecomposer] 标准化结果', {
      batchId: normalizedBatchId,
      itemId,
      rawCount,
      afterNormalize: normalizedRaw.length,
      afterCompleteness: normalizedQuestions.length,
      filteredCount,
      rejectedIncomplete: normalizedRaw.length - normalizedQuestions.length,
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

    const rawPreview = err?.rawPreview ?? err?.cause?.rawPreview
    return {
      success: false,
      insertedCount: 0,
      parsedCount: 0,
      questions: [],
      realCount,
      status: 'running',
      error: msg,
      rawPreview,
      jsonParseFailed: /JSON\s*解析|JSON\s*修复|repairJSON/i.test(msg),
    }
  }
}
