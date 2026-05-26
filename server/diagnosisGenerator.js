import { buildMockDiagnosisReport } from './mockDiagnosisData.js'
import { callDeepSeekAI, callDeepSeekVisionAI, extractJson, getDeepSeekConfig, serializeError } from './deepseekClient.js'
import { normalizeDiagnosisReport } from './diagnosisNormalizer.js'

const MOCK_FALLBACK_MESSAGE = 'AI服务暂不可用，已展示示例诊断报告'

const SYSTEM_PROMPT =
  '你是专业的 K12 学情诊断专家。必须只输出合法 JSON，不使用 markdown 代码块。所有字符串字段必须填写实质内容，禁止留空字符串或 null。'

function buildDiagnosisPrompt(form, hasImage) {
  const imageSection = hasImage
    ? `
【试卷图片说明】
用户已上传试卷照片。请结合下方考试信息与常见试卷结构，推断可能的失分点与薄弱知识点。
若无法从图片直接读取，请依据用户填写的分数与困惑生成尽可能具体的诊断内容，字段不得留空。
`
    : ''

  return `你是一位资深 K12 学习诊断专家。请根据以下信息生成一份完整的学习诊断报告 JSON。

【考试信息】
- 考试类型：${form.examType}
- 学科：${form.subject}
- 得分：${form.score} / ${form.fullScore}
- 年级排名：${form.gradeRank ?? '未提供'}
- 学生困惑：${form.confusion || '未填写'}
${imageSection}
【输出要求】
1. 只返回 JSON，不要 markdown 代码块
2. 必须包含字段：title, generatedAt(ISO时间), scoreOverview, lossAnalysis(4项百分比之和100), weakPoints(至少3项), wrongQuestions(至少2项), improvementPlan(14天每天1-2任务), recommendedExercises(至少5项)
3. lossAnalysis 的 type 只能是 knowledge/ability/skill/psychology
4. scoreOverview 包含 score, fullScore, gradeRank, trend(up/down/stable), trendDelta, percentile
5. weakPoints 每项必须有 name/weight(1-5)/typicalWrong/correctSolution
6. wrongQuestions 每项必须有 content/studentAnswer/correctAnswer/thinkingBlock
7. improvementPlan 至少14天，每天1-2个任务
8. recommendedExercises 至少5项
9. 任何字段不得为空，无法确定时填写"暂无数据"`
}

/**
 * 与教育规划 generatePlanning 对齐：优先 callDeepSeekAI 文本接口。
 * 仅当配置了 DEEPSEEK_VISION_MODEL 且含图片时，才尝试视觉接口，失败则回退文本接口。
 */
async function invokeDiagnosisAI(form) {
  const hasImage = Boolean(form.examImageBase64)
  const userPrompt = buildDiagnosisPrompt(form, hasImage)
  const cfg = getDeepSeekConfig()
  const tryVision = hasImage && cfg.visionEnabled

  console.log('[诊断生成] 调用 DeepSeek', {
    hasImage,
    tryVision,
    model: cfg.model,
    visionModel: cfg.visionModel || '(未配置，使用文本API)',
    promptLength: userPrompt.length,
    imageBase64KB: hasImage ? (Buffer.byteLength(form.examImageBase64, 'utf8') / 1024).toFixed(1) : 0,
  })

  if (tryVision) {
    try {
      const content = await callDeepSeekVisionAI(
        SYSTEM_PROMPT,
        userPrompt,
        form.examImageBase64,
        form.examImageMimeType || 'image/jpeg',
      )
      return { content, mode: 'vision' }
    } catch (visionError) {
      console.warn('[诊断生成] 视觉 API 失败，回退文本 API（与教育规划相同）', serializeError(visionError))
    }
  }

  const content = await callDeepSeekAI(SYSTEM_PROMPT, userPrompt)
  return { content, mode: 'text' }
}

export async function generateDiagnosis(form) {
  try {
    const { content, mode } = await invokeDiagnosisAI(form)
    const parsed = JSON.parse(extractJson(content))
    const report = normalizeDiagnosisReport(parsed, form)

    return {
      report,
      message:
        mode === 'vision'
          ? '诊断报告生成成功（DeepSeek 试卷图片分析）'
          : '诊断报告生成成功（DeepSeek AI）',
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
