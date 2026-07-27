/**
 * 多 AI 协作编排器
 * taskType: photo-search | exam-builder | education-planning | diagnosis
 */
import { buildSmartExam } from './teacher/examBuilderService.js'
import { getSupabaseAdmin, isSupabaseAdminConfigured } from './supabaseAdmin.js'
import {
  AI_CALL_TIMEOUT_MS,
  callDoubaoAI,
  callQianwenAI,
  callDeepSeekWithTimeout,
  isDeepSeekAvailable,
  isDoubaoAvailable,
  isQianwenAvailable,
  isDoubaoVisionOcrAvailable,
  safeAiCall,
} from './aiProviders.js'
import {
  recognizePhotoQuestionDoubao,
} from './doubaoVisionOcr.js'
import { repairJSON } from './batch/jsonRepairEngine.js'
import { generateDataDrivenPlan } from './planningEngine.js'
import {
  PHOTO_SEARCH_SYSTEM_PROMPT,
  enrichPhotoSearchResult,
  mapBankHitForOrchestrator,
  parseStructuredPhotoSearchJson,
} from './student/photoSearchPrompt.js'

const SUPPORTED_TASKS = new Set(['photo-search', 'exam-builder', 'education-planning', 'diagnosis'])

function normalizeText(s) {
  return String(s || '').replace(/\s+/g, '').trim()
}

function textSimilarity(a, b) {
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

async function findSimilarBankQuestions(ocrText, limit = 5) {
  if (!isSupabaseAdminConfigured()) return []
  const keyword = String(ocrText || '').replace(/\s+/g, ' ').trim()
  const segments = keyword.match(/[\u4e00-\u9fa5a-zA-Z0-9·°²³√∫∑π]{6,}/g) || []
  const best = segments.sort((a, b) => b.length - a.length)[0] || keyword
  const q = (best || keyword).slice(0, 48)
  if (q.length < 6) return []

  const admin = getSupabaseAdmin()
  const tables = ['teacher_question_bank', 'batch_question_bank']
  const collected = []

  for (const table of tables) {
    const query = admin
      .from(table)
      .select('id, content, answer, analysis, knowledge_point, subject, question_type, options, difficulty')
      .ilike('content', `%${q}%`)
      .limit(limit)

    let q = query
    if (table === 'batch_question_bank') {
      q = q.eq('visibility', 'public')
    }
    const { data, error } = await q

    if (error) {
      console.warn('[aiOrchestrator] 题库检索失败', { table, message: error.message })
      continue
    }
    for (const row of data ?? []) {
      collected.push({ ...row, _table: table, _score: textSimilarity(ocrText, row.content) })
    }
  }

  return collected.sort((a, b) => b._score - a._score).slice(0, limit)
}

function parseVerifierJson(raw, fallback = {}) {
  try {
    const parsed = repairJSON(raw)
    return parsed && typeof parsed === 'object' ? parsed : fallback
  } catch {
    return fallback
  }
}

/** 豆包仲裁 OCR 双路结果 */
async function arbitrateOcrTexts(ocrA, ocrB, meta = {}) {
  const textA = String(ocrA || '').trim()
  const textB = String(ocrB || '').trim()
  if (!textA && !textB) return { text: '', provider: 'none', skipped: true }
  if (textA && !textB) return { text: textA, provider: 'single-ocr', skipped: false }
  if (!textA && textB) return { text: textB, provider: 'single-ocr', skipped: false }
  if (textA === textB) return { text: textA, provider: 'ocr-consensus', skipped: false }

  const doubao = await safeAiCall('Doubao-OCR-arbitrate', isDoubaoAvailable, () =>
    callDoubaoAI(
      '你是 OCR 结果仲裁专家。比较两路识别结果，输出最优完整题目文字。只输出 JSON：{"bestText":"...","reason":"..."}',
      `OCR-A:\n${textA}\n\nOCR-B:\n${textB}\n\n元信息: ${JSON.stringify(meta)}`,
      { label: 'Doubao-OCR-arbitrate', temperature: 0.1 },
    ),
  )

  if (doubao.ok) {
    const parsed = parseVerifierJson(doubao.result, {})
    if (parsed.bestText?.trim()) {
      return { text: parsed.bestText.trim(), provider: 'doubao-arbitrate', reason: parsed.reason, skipped: false }
    }
  }

  return {
    text: textA.length >= textB.length ? textA : textB,
    provider: 'ocr-longest-fallback',
    skipped: false,
    degraded: !doubao.ok,
  }
}

async function runPhotoSearchOrchestration(input) {
  const { imageBase64, imageName = 'photo.jpg', userId, clientOcrText, editedOcrText } = input ?? {}
  const meta = { providersUsed: [], degraded: false, reviewRequired: false }

  const preOcr = (clientOcrText || editedOcrText || '').trim()
  let ocrText = ''

  if (preOcr) {
    ocrText = preOcr
    meta.providersUsed.push(clientOcrText ? 'client-tesseract' : 'user-edited-ocr')
    if (clientOcrText) {
      meta.degraded = true
      meta.ocrFallback = true
      meta.clientOcr = true
    }
    console.log('[aiOrchestrator] 使用预置 OCR 文本', {
      source: clientOcrText ? 'client-tesseract' : 'edited',
      charCount: ocrText.length,
    })
  } else {
    if (!imageBase64?.trim()) {
      throw new Error('请上传题目图片')
    }

    if (!isDoubaoVisionOcrAvailable()) {
      throw Object.assign(
        new Error('豆包视觉 OCR 未配置，请设置 DOUBAO_API_KEY 与 DOUBAO_VISION_MODEL'),
        { searchStatus: 'blurry' },
      )
    }

    const doubaoVision = await safeAiCall('Doubao-Vision-OCR', isDoubaoVisionOcrAvailable, () =>
      recognizePhotoQuestionDoubao(imageBase64, { fileName: imageName }),
    )

    if (doubaoVision.ok) {
      ocrText = String(doubaoVision.result || '').trim()
      meta.providersUsed.push('doubao-vision')
      console.log('[aiOrchestrator] 豆包视觉 OCR 成功', { charCount: ocrText.length })
    } else {
      throw Object.assign(
        new Error(doubaoVision.error || '豆包视觉 OCR 识别失败'),
        { searchStatus: 'blurry' },
      )
    }
  }

  if (normalizeText(ocrText).length < 8) {
    throw Object.assign(new Error('图片字迹模糊无法识别'), { searchStatus: 'blurry' })
  }

  const candidates = meta.ocrFallback ? [] : await findSimilarBankQuestions(ocrText)
  const best = candidates[0]

  let solveResult = null
  if (isDeepSeekAvailable()) {
    const deepseek = await safeAiCall('DeepSeek-solve', isDeepSeekAvailable, () =>
      callDeepSeekWithTimeout(
        PHOTO_SEARCH_SYSTEM_PROMPT,
        `OCR文字：\n${ocrText}\n\n题库候选：\n${candidates.map((c, i) => `[${i + 1}] id=${c.id} 相似${(c._score * 100).toFixed(0)}% ${c.content?.slice(0, 200)}`).join('\n')}`,
        { label: 'PhotoSearch-DeepSeek', temperature: 0.2 },
      ),
    )
    if (deepseek.ok) {
      solveResult = parseVerifierJson(deepseek.result, {})
      meta.providersUsed.push('deepseek-solve')
    } else {
      meta.degraded = true
    }
  } else {
    meta.degraded = true
  }

  if (!solveResult && best && best._score >= 0.55) {
    const structured = mapBankHitForOrchestrator(best, ocrText, candidates)
    return {
      success: true,
      taskType: 'photo-search',
      result: {
        ...structured,
        searchStatus: 'success',
        reviewRequired: false,
        userId,
        ...(meta.ocrFallback ? { ocrFallback: true } : {}),
      },
      meta,
    }
  }

  const structuredFromAi = solveResult
    ? parseStructuredPhotoSearchJson(solveResult, ocrText, candidates)
    : enrichPhotoSearchResult(
        {
          ocrText,
          question: best?.content || ocrText,
          answer: best?.answer || '',
          analysis: best?.analysis || '',
          knowledgePoints: best?.knowledge_point ? [best.knowledge_point] : [],
          source: best ? 'bank' : 'ai',
          bankQuestionId: best ? String(best.id) : null,
        },
        candidates,
      )

  const answer = structuredFromAi.answer || best?.answer || ''
  const analysis = structuredFromAi.stepSolution || structuredFromAi.analysis || best?.analysis || ''

  // ============ OCR 降级模式：跳过豆包和千问验证 ============
  if (meta.ocrFallback) {
    console.log('[aiOrchestrator] OCR 降级模式，跳过豆包/千问答案验证')
    return {
      success: true,
      taskType: 'photo-search',
      result: {
        ...structuredFromAi,
        answer,
        analysis,
        searchStatus: 'success',
        reviewRequired: false,
        ocrFallback: true,
        userId,
      },
      meta,
    }
  }

  const doubaoVerify = await safeAiCall('Doubao-verify', isDoubaoAvailable, () =>
    callDoubaoAI(
      '验证解题答案是否正确、完整。只输出 JSON：{"approved":true|false,"comment":"..."}',
      `题目：${solveResult?.question || ocrText}\n答案：${answer}\n解析：${analysis}`,
      { label: 'Doubao-verify-answer', temperature: 0.1 },
    ),
  )

  const qianwenVerify = await safeAiCall('Qianwen-verify', isQianwenAvailable, () =>
    callQianwenAI(
      '验证解题答案是否正确、完整。只输出 JSON：{"approved":true|false,"comment":"..."}',
      `题目：${solveResult?.question || ocrText}\n答案：${answer}\n解析：${analysis}`,
      { label: 'Qianwen-verify-answer', temperature: 0.1 },
    ),
  )

  if (doubaoVerify.ok) meta.providersUsed.push('doubao-verify')
  if (qianwenVerify.ok) meta.providersUsed.push('qianwen-verify')

  const dApproved = doubaoVerify.ok ? parseVerifierJson(doubaoVerify.result, {}).approved : null
  const qApproved = qianwenVerify.ok ? parseVerifierJson(qianwenVerify.result, {}).approved : null

  let reviewRequired = false
  if (dApproved !== null && qApproved !== null) {
    reviewRequired = dApproved !== qApproved
    meta.verification = { doubao: dApproved, qianwen: qApproved, consensus: !reviewRequired }
  } else if (dApproved === false || qApproved === false) {
    reviewRequired = true
    meta.verification = { doubao: dApproved, qianwen: qApproved }
  }

  if (!doubaoVerify.ok && !qianwenVerify.ok) meta.degraded = true

  return {
    success: true,
    taskType: 'photo-search',
    result: {
      ...structuredFromAi,
      answer: reviewRequired ? `${answer}\n\n【答案需审阅】` : answer,
      analysis,
      searchStatus: 'success',
      reviewRequired,
      userId,
    },
    meta,
  }
}

async function runExamBuilderOrchestration(input) {
  const { teacherId, config } = input ?? {}
  if (!teacherId) throw new Error('缺少 teacherId')

  const meta = { providersUsed: [], degraded: false, reviewRequired: false, disagreements: [] }

  if (!isDeepSeekAvailable()) meta.degraded = true
  const exam = await buildSmartExam(teacherId, config)
  if (isDeepSeekAvailable()) meta.providersUsed.push('deepseek-exam-builder')

  const examSummary = JSON.stringify({
    title: exam.title,
    subject: exam.subject,
    grade: exam.grade,
    sections: exam.sections?.map((s) => ({
      type: s.question_type,
      count: s.questions?.length,
      knowledge: [...new Set(s.questions?.map((q) => q.knowledge_point).filter(Boolean) || [])],
    })),
  }).slice(0, 6000)

  const coveragePrompt = `组卷方案：\n${examSummary}\n要求知识点覆盖：${config.knowledgeCoverage || '综合'}`

  const doubaoCoverage = await safeAiCall('Doubao-coverage', isDoubaoAvailable, () =>
    callDoubaoAI(
      '评估组卷知识点覆盖度。只输出 JSON：{"score":0-100,"gaps":["..."],"approved":true|false}',
      coveragePrompt,
      { label: 'Doubao-exam-coverage', temperature: 0.1 },
    ),
  )

  const qianwenDifficulty = await safeAiCall('Qianwen-difficulty', isQianwenAvailable, () =>
    callQianwenAI(
      '评估组卷难度分布是否合理。只输出 JSON：{"score":0-100,"issues":["..."],"approved":true|false}',
      `${coveragePrompt}\n目标难度分布：${JSON.stringify(config.typeDistribution || [])}`,
      { label: 'Qianwen-exam-difficulty', temperature: 0.1 },
    ),
  )

  if (doubaoCoverage.ok) meta.providersUsed.push('doubao-coverage')
  if (qianwenDifficulty.ok) meta.providersUsed.push('qianwen-difficulty')

  const coverage = doubaoCoverage.ok ? parseVerifierJson(doubaoCoverage.result, {}) : null
  const difficulty = qianwenDifficulty.ok ? parseVerifierJson(qianwenDifficulty.result, {}) : null

  if (coverage && difficulty) {
    const cOk = coverage.approved !== false
    const dOk = difficulty.approved !== false
    meta.reviewRequired = !(cOk && dOk)
    if (!cOk) meta.disagreements.push({ type: 'coverage', detail: coverage })
    if (!dOk) meta.disagreements.push({ type: 'difficulty', detail: difficulty })
  } else {
    meta.degraded = true
  }

  if (isDoubaoAvailable() && (doubaoCoverage.ok || qianwenDifficulty.ok)) {
    const arbitrate = await safeAiCall('Doubao-exam-arbitrate', isDoubaoAvailable, () =>
      callDoubaoAI(
        '综合知识点覆盖与难度评估，给出最终组卷建议。只输出 JSON：{"summary":"...","adjustments":["..."]}',
        `覆盖评估：${JSON.stringify(coverage)}\n难度评估：${JSON.stringify(difficulty)}`,
        { label: 'Doubao-exam-arbitrate', temperature: 0.2 },
      ),
    )
    if (arbitrate.ok) {
      meta.arbitration = parseVerifierJson(arbitrate.result, {})
      meta.providersUsed.push('doubao-exam-arbitrate')
    }
  }

  return {
    success: true,
    taskType: 'exam-builder',
    result: {
      exam,
      reviewRequired: meta.reviewRequired,
      validation: { coverage, difficulty },
      arbitration: meta.arbitration ?? null,
    },
    meta,
  }
}

async function runEducationPlanningOrchestration(input) {
  const form = input?.form ?? input ?? {}
  const meta = { providersUsed: [], degraded: false, reviewRequired: false, disagreements: [] }

  if (!form.studentName || !form.grade || !form.scoreLevel) {
    throw new Error('缺少学生姓名、年级或成绩水平')
  }

  const enhanced = form._enhanced ?? form.enhanced ?? {}
  const targetUniversity =
    form.targetUniversity ||
    enhanced.targetSchools?.[0] ||
    form.targetSchools?.[0] ||
    enhanced.targetTierLevel ||
    form.targetTierLevel ||
    ''
  const province =
    form.province ||
    enhanced.schoolInfo?.province ||
    form.schoolInfo?.province ||
    ''
  const major = form.targetMajor || enhanced.targetMajor || '通用'

  if (!targetUniversity?.trim()) {
    throw new Error('缺少目标院校或院校层次，请在「目标期望」中选择院校层次或填写具体院校')
  }
  if (!province?.trim()) {
    throw new Error('缺少省份信息，请在学校信息中选择省份')
  }

  const engineResult = await generateDataDrivenPlan(
    targetUniversity.trim(),
    province.trim(),
    major.trim() || '通用',
    form,
  )

  if (!engineResult.success) {
    if (engineResult.error === 'EMPTY_DATA') {
      return {
        success: false,
        taskType: 'education-planning',
        error: engineResult.message,
        result: null,
        meta: {
          ...meta,
          emptyDataRule: engineResult.emptyDataRule,
          forbidAiHallucination: engineResult.forbidAiHallucination,
        },
      }
    }
    throw new Error(engineResult.message || '数据驱动规划生成失败')
  }

  meta.providersUsed.push(...(engineResult.meta?.providersUsed ?? ['planningEngine']))
  meta.degraded = engineResult.isDegraded || false
  let planRaw = engineResult.report
  const planText = JSON.stringify(planRaw).slice(0, 8000)

  const policyCheck = await safeAiCall('Doubao-policy', isDoubaoAvailable, () =>
    callDoubaoAI(
      '检查教育规划是否符合双减与升学政策合规。只输出 JSON：{"compliant":true|false,"issues":["..."],"approved":true|false}',
      planText,
      { label: 'Doubao-planning-policy', temperature: 0.1 },
    ),
  )

  const taskCheck = await safeAiCall('Qianwen-tasks', isQianwenAvailable, () =>
    callQianwenAI(
      '检查教育规划任务量与节奏是否合理。只输出 JSON：{"reasonable":true|false,"issues":["..."],"approved":true|false}',
      planText,
      { label: 'Qianwen-planning-tasks', temperature: 0.1 },
    ),
  )

  if (policyCheck.ok) meta.providersUsed.push('doubao-policy')
  if (taskCheck.ok) meta.providersUsed.push('qianwen-tasks')

  const policy = policyCheck.ok ? parseVerifierJson(policyCheck.result, {}) : null
  const tasks = taskCheck.ok ? parseVerifierJson(taskCheck.result, {}) : null

  if (policy && tasks) {
    const ok = policy.approved !== false && tasks.approved !== false
    meta.reviewRequired = !ok
    if (policy.approved === false) meta.disagreements.push({ type: 'policy', detail: policy })
    if (tasks.approved === false) meta.disagreements.push({ type: 'tasks', detail: tasks })
  } else {
    meta.degraded = true
  }

  let arbitration = null
  if (isDoubaoAvailable()) {
    const arb = await safeAiCall('Doubao-plan-arbitrate', isDoubaoAvailable, () =>
      callDoubaoAI(
        '综合政策与任务评估，输出最终规划摘要。只输出 JSON：{"summary":"...","diffPoints":["差异点..."],"finalNotes":"..."}',
        `规划：${planText.slice(0, 4000)}\n政策：${JSON.stringify(policy)}\n任务：${JSON.stringify(tasks)}\n数据引用：${JSON.stringify(engineResult.citation)}`,
        { label: 'Doubao-planning-arbitrate', temperature: 0.2 },
      ),
    )
    if (arb.ok) {
      arbitration = parseVerifierJson(arb.result, {})
      meta.providersUsed.push('doubao-planning-arbitrate')
    }
  }

  return {
    success: true,
    taskType: 'education-planning',
    result: {
      report: planRaw,
      reviewRequired: meta.reviewRequired,
      validation: { policy, tasks },
      arbitration,
      diffPoints: arbitration?.diffPoints ?? meta.disagreements,
      universityLookup: engineResult.lookup,
      dataSourceCitation: engineResult.citation,
      fiveStagePlan: engineResult.fiveStagePlan,
      gapBand: engineResult.gapBand,
    },
    meta,
  }
}

async function runDiagnosisOrchestration(input) {
  const form = input?.form ?? input ?? {}
  const meta = { providersUsed: [], degraded: false, reviewRequired: false }

  if (!form.examPaperText && !form.answerSheetOcrText && !form.ocrText) {
    throw new Error('缺少诊断 OCR 文本')
  }

  let report = null
  if (isDeepSeekAvailable()) {
    const ds = await safeAiCall('DeepSeek-diagnosis', isDeepSeekAvailable, () =>
      callDeepSeekWithTimeout(
        '你是 K12 教学诊断专家。只输出合法 JSON 诊断报告。',
        `对比试卷与答题卡：\n试卷：${form.examPaperText || ''}\n答题卡：${form.answerSheetOcrText || form.ocrText || ''}\n考试信息：${JSON.stringify(form)}`,
        { label: 'Diagnosis-DeepSeek', temperature: 0.3, maxTokens: 6000 },
      ),
    )
    if (ds.ok) {
      report = parseVerifierJson(ds.result, {})
      meta.providersUsed.push('deepseek-diagnosis')
    } else {
      meta.degraded = true
      throw new Error(ds.error || 'DeepSeek 诊断失败')
    }
  } else {
    throw new Error('DeepSeek 未配置，无法生成诊断')
  }

  const reportText = JSON.stringify(report).slice(0, 6000)

  const doubaoV = await safeAiCall('Doubao-diagnosis', isDoubaoAvailable, () =>
    callDoubaoAI(
      '验证诊断报告逻辑与数据一致性。只输出 JSON：{"approved":true|false,"comment":"..."}',
      reportText,
      { label: 'Doubao-diagnosis-verify', temperature: 0.1 },
    ),
  )

  const qianwenV = await safeAiCall('Qianwen-diagnosis', isQianwenAvailable, () =>
    callQianwenAI(
      '验证诊断报告建议是否可执行。只输出 JSON：{"approved":true|false,"comment":"..."}',
      reportText,
      { label: 'Qianwen-diagnosis-verify', temperature: 0.1 },
    ),
  )

  if (doubaoV.ok) meta.providersUsed.push('doubao-diagnosis-verify')
  if (qianwenV.ok) meta.providersUsed.push('qianwen-diagnosis-verify')

  const dOk = doubaoV.ok ? parseVerifierJson(doubaoV.result, {}).approved : null
  const qOk = qianwenV.ok ? parseVerifierJson(qianwenV.result, {}).approved : null

  if (dOk !== null && qOk !== null) {
    meta.reviewRequired = dOk !== qOk || dOk === false || qOk === false
    meta.verification = { doubao: dOk, qianwen: qOk }
  } else {
    meta.degraded = true
  }

  return {
    success: true,
    taskType: 'diagnosis',
    result: {
      report,
      reviewRequired: meta.reviewRequired,
      message: meta.reviewRequired ? '诊断报告需审阅' : '诊断完成',
    },
    meta,
  }
}

/**
 * AI 协作任务入口
 * @param {'photo-search'|'exam-builder'|'education-planning'|'diagnosis'} taskType
 * @param {object} input
 */
export async function orchestrateAITask(taskType, input = {}) {
  const type = String(taskType || '').trim()
  if (!SUPPORTED_TASKS.has(type)) {
    throw new Error(`不支持的 taskType: ${type}，可选: ${[...SUPPORTED_TASKS].join(', ')}`)
  }

  console.log('[aiOrchestrator] 开始', {
    taskType: type,
    timeoutMs: AI_CALL_TIMEOUT_MS,
    providers: {
      deepseek: isDeepSeekAvailable(),
      doubao: isDoubaoAvailable(),
      qianwen: isQianwenAvailable(),
      doubaoVisionOcr: isDoubaoVisionOcrAvailable(),
    },
  })

  try {
    if (type === 'photo-search') return await runPhotoSearchOrchestration(input)
    if (type === 'exam-builder') return await runExamBuilderOrchestration(input)
    if (type === 'education-planning') return await runEducationPlanningOrchestration(input)
    if (type === 'diagnosis') return await runDiagnosisOrchestration(input)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[aiOrchestrator] 失败', { taskType: type, message })
    return {
      success: false,
      taskType: type,
      error: message,
      result: null,
      meta: { degraded: true },
    }
  }
}
