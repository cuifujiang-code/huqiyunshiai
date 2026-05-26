import { buildMockDiagnosisReport } from './mockDiagnosisData.js'
import { callDeepSeekAI, extractJson, serializeError } from './deepseekClient.js'
import { normalizeDiagnosisReport } from './diagnosisNormalizer.js'

const MOCK_FALLBACK_MESSAGE = 'AI服务暂不可用，已展示示例诊断报告'

const SYSTEM_PROMPT =
  '你是专业的 K12 教学诊断专家。必须只输出合法 JSON，不使用 markdown 代码块。所有字符串字段必须填写实质内容，禁止留空。分析必须严格对比【试卷原文】与【学生答题卡OCR】，不得编造试卷或作答中未出现的内容。'

function buildCompareDiagnosisPrompt(form) {
  const examPaperText = form.examPaperText?.trim() || ''
  const answerSheetOcrText = form.answerSheetOcrText?.trim() || form.ocrText?.trim() || ''
  const ocrIncomplete = Boolean(form.ocrIncomplete)
  const hasCompare = examPaperText.length > 0 && answerSheetOcrText.length > 0

  const compareSection = hasCompare
    ? `
请作为一位教学诊断专家，仔细对比以下试卷和学生作答：

【试卷原文】
${examPaperText}

【学生答题卡OCR识别结果】
${answerSheetOcrText}

请完成以下任务：
1. 逐题列出：题号、正确答案、学生答案、对错判断
2. 对每道错题分析错误原因（计算错误/概念不清/审题失误/完全不会/字迹潦草无法辨认）
3. 统计各知识点的得分率（正确题数/总题数）
4. 列出薄弱知识点，按优先级排序（失分最多的排最前）
5. 给出针对性提升建议（每个薄弱点配1-2条具体可执行的建议）
6. ${ocrIncomplete ? 'OCR识别内容明显有缺漏或无法辨认，必须在 imageAnalysisSummary 开头注明「以下分析基于不完整的 OCR 结果，仅供参考」' : '在 imageAnalysisSummary 说明对比分析依据'}
`
    : `
【说明】未提供完整试卷与答题卡对比文本，请基于考试信息生成诊断，并说明数据不完整原因。
`

  return `${compareSection}

【考试信息】
- 考试类型：${form.examType}
- 学科：${form.subject}
- 得分：${form.score} / ${form.fullScore}
- 年级排名：${form.gradeRank ?? '未提供'}
- 学生困惑：${form.confusion || '未填写'}

【JSON 输出要求】
1. 只返回 JSON，不要 markdown 代码块
2. 必须包含：title, generatedAt(ISO), scoreOverview, lossAnalysis(4项百分比之和100), weakPoints(至少3项), wrongQuestions(至少2项), improvementPlan(14天每天1-2任务), recommendedExercises(至少5项), imageAnalysisSummary
3. lossAnalysis 的 type 只能是 knowledge/ability/skill/psychology
4. wrongQuestions 须体现逐题对比：content(题目), studentAnswer, correctAnswer, thinkingBlock(错因分析)
5. weakPoints 按失分优先级排序，weight 越大越薄弱
6. 任何字段不得为空`
}

async function invokeDiagnosisAI(form) {
  const userPrompt = buildCompareDiagnosisPrompt(form)

  console.log('[诊断生成] DeepSeek 对比分析', {
    examPaperLength: form.examPaperText?.length ?? 0,
    answerOcrLength: form.answerSheetOcrText?.length ?? form.ocrText?.length ?? 0,
    ocrIncomplete: Boolean(form.ocrIncomplete),
    promptLength: userPrompt.length,
  })

  const content = await callDeepSeekAI(SYSTEM_PROMPT, userPrompt)
  return { content }
}

export async function generateDiagnosis(form) {
  try {
    const { content } = await invokeDiagnosisAI(form)
    const parsed = JSON.parse(extractJson(content))
    const report = normalizeDiagnosisReport(parsed, form)

    return {
      report,
      message: form.examPaperText
        ? '对比诊断报告生成成功（试卷原文 + 答题卡 OCR + DeepSeek）'
        : '诊断报告生成成功（DeepSeek AI）',
      isMockFallback: false,
    }
  } catch (error) {
    const errorDetail = serializeError(error)
    console.error('[诊断生成] DeepSeek 不可用，使用演示数据:', errorDetail)
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
