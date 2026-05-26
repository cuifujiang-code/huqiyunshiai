import { buildMockDiagnosisReport } from './mockDiagnosisData.js'
import { callDeepSeekAI, extractJson, serializeError } from './deepseekClient.js'
import { normalizeDiagnosisReport } from './diagnosisNormalizer.js'

const MOCK_FALLBACK_MESSAGE = 'AI服务暂不可用，已展示示例诊断报告'

const SYSTEM_PROMPT =
  '你是专业的 K12 学情诊断专家。必须只输出合法 JSON，不使用 markdown 代码块。所有字符串字段必须填写实质内容，禁止留空字符串或 null。分析必须严格基于用户提供的 OCR 文本或考试信息，不得编造与输入无关的题目或答案。'

function buildDiagnosisPrompt(form) {
  const ocrText = form.ocrText?.trim() || ''
  const hasOcr = ocrText.length > 0
  const ocrIncomplete = Boolean(form.ocrIncomplete)

  const ocrSection = hasOcr
    ? `
【试卷 OCR 识别文本】
以下内容由前端 Tesseract OCR 自动识别，可能存在错漏、乱码或遗漏。请仅基于下列文本进行诊断，不要编造 OCR 中未出现的题目。
${ocrIncomplete ? '⚠ OCR 识别质量较低或内容不完整，必须在 imageAnalysisSummary 字段开头明确说明：「以下分析基于不完整的 OCR 结果，仅供参考」。' : '请在 imageAnalysisSummary 开头说明：「以下分析基于 OCR 识别文本」。'}

${ocrText}

【基于 OCR 的分析步骤（必须严格执行）】
1. 在 imageAnalysisSummary 中首先概述 OCR 识别到的试卷整体情况（页数、题量、题型、得分概况）
2. 列出 OCR 识别到的所有题目及学生作答/得分情况
3. 在 wrongQuestions 中逐题分析：题目内容(content)、学生答案(studentAnswer)、正确答案(correctAnswer)、是否得分、思维断点(thinkingBlock)
4. 根据错题与失分情况总结 weakPoints 薄弱知识点
5. 在 improvementPlan 和 recommendedExercises 中给出与错题相关的针对性提升建议
6. 若 OCR 文本无法辨认某题，该题相关字段填「OCR无法识别」并说明，不可凭空编造
`
    : `
【说明】用户未提供试卷 OCR 文本。请基于下方考试信息与困惑生成诊断，并在 imageAnalysisSummary 说明「未提供试卷 OCR 文本，分析基于用户填写的分数与描述」。
`

  return `你是一位资深 K12 学习诊断专家。请根据以下信息生成一份完整的学习诊断报告 JSON。

【考试信息】
- 考试类型：${form.examType}
- 学科：${form.subject}
- 得分：${form.score} / ${form.fullScore}
- 年级排名：${form.gradeRank ?? '未提供'}
- 学生困惑：${form.confusion || '未填写'}
- 试卷页数：${form.examImageCount ?? 0}
${ocrSection}
【输出要求】
1. 只返回 JSON，不要 markdown 代码块
2. 必须包含字段：title, generatedAt(ISO时间), scoreOverview, lossAnalysis(4项百分比之和100), weakPoints(至少3项), wrongQuestions(至少2项), improvementPlan(14天每天1-2任务), recommendedExercises(至少5项), imageAnalysisSummary
3. lossAnalysis 的 type 只能是 knowledge/ability/skill/psychology
4. scoreOverview 包含 score, fullScore, gradeRank, trend(up/down/stable), trendDelta, percentile
5. weakPoints 每项必须有 name/weight(1-5)/typicalWrong/correctSolution
6. wrongQuestions 每项必须有 content/studentAnswer/correctAnswer/thinkingBlock，且须与 OCR 文本中的题目对应
7. improvementPlan 至少14天，每天1-2个任务
8. recommendedExercises 至少5项
9. 任何字段不得为空，无法确定时填写"暂无数据"或"OCR无法识别"`
}

async function invokeDiagnosisAI(form) {
  const userPrompt = buildDiagnosisPrompt(form)

  console.log('[诊断生成] 调用 DeepSeek 文本 API', {
    hasOcr: Boolean(form.ocrText?.trim()),
    ocrLength: form.ocrText?.length ?? 0,
    ocrIncomplete: Boolean(form.ocrIncomplete),
    examImageCount: form.examImageCount ?? 0,
    promptLength: userPrompt.length,
  })

  const content = await callDeepSeekAI(SYSTEM_PROMPT, userPrompt)
  return { content, mode: 'text' }
}

export async function generateDiagnosis(form) {
  try {
    const { content, mode } = await invokeDiagnosisAI(form)
    const parsed = JSON.parse(extractJson(content))
    const report = normalizeDiagnosisReport(parsed, form)

    const ocrNote = form.ocrIncomplete ? '（基于 OCR 文本，识别不完整）' : form.ocrText ? '（基于 OCR 识别文本）' : ''

    return {
      report,
      message: `诊断报告生成成功（DeepSeek AI）${ocrNote}`,
      isMockFallback: false,
    }
  } catch (error) {
    const errorDetail = serializeError(error)
    console.error('[诊断生成] DeepSeek AI 不可用，使用演示数据:', errorDetail)
    const report = { ...buildMockDiagnosisReport(form), source: 'mock' }
    return {
      report,
      message: MOCK_FALLBACK_MESSAGE,
      isMockFallback: true,
      errorDetail,
    }
  }
}

export { MOCK_FALLBACK_MESSAGE }
