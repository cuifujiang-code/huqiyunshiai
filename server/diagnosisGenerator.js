import { buildMockDiagnosisReport } from './mockDiagnosisData.js'
import { callDeepSeekAI, callDeepSeekVisionAI, extractJson, serializeError } from './deepseekClient.js'
import { normalizeDiagnosisReport } from './diagnosisNormalizer.js'

const MOCK_FALLBACK_MESSAGE = 'AI服务暂不可用，已展示示例诊断报告'

const SYSTEM_PROMPT =
  '你是专业的 K12 学情诊断专家。必须只输出合法 JSON，不使用 markdown 代码块。所有字符串字段必须填写实质内容，禁止留空字符串或 null。'

function buildDiagnosisPrompt(form, hasImage) {
  const imageSection = hasImage
    ? `
【试卷图片分析要求】（已附试卷照片）
1. 仔细识别图片中的：学生姓名/班级（如有）、每道题得分或扣分、错题题号
2. 归纳知识点对错分布（正确/错误/部分正确）
3. 对每道错题给出：题目摘要、学生答案、正确答案、思维断点分析
4. 在 JSON 根节点增加 imageAnalysisSummary 字段，200字以内概括试卷整体情况
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
3. lossAnalysis 的 type 只能是 knowledge/ability/skill/psychology，每项必须有 label/percentage/color/explanation
4. scoreOverview 包含 score, fullScore, gradeRank, trend(up/down/stable), trendDelta, percentile
5. weakPoints 每项必须有 name/weight(1-5)/typicalWrong/correctSolution
6. wrongQuestions 每项必须有 content/studentAnswer/correctAnswer/thinkingBlock
7. improvementPlan 格式：[{ "day": "Day 1", "tasks": [{ "id": "d1", "text": "任务", "completed": false }] }]
8. recommendedExercises 每项必须有 content/type/difficulty
9. 任何字段不得为空，若图片无法识别某信息，填写"暂无数据"并说明原因`
}

export async function generateDiagnosis(form) {
  const hasImage = Boolean(form.examImageBase64)
  const userPrompt = buildDiagnosisPrompt(form, hasImage)

  try {
    const aiContent = hasImage
      ? await callDeepSeekVisionAI(
          SYSTEM_PROMPT,
          userPrompt,
          form.examImageBase64,
          form.examImageMimeType || 'image/jpeg',
        )
      : await callDeepSeekAI(SYSTEM_PROMPT, userPrompt)

    const parsed = JSON.parse(extractJson(aiContent))
    const report = normalizeDiagnosisReport(parsed, form)
    return {
      report,
      message: hasImage ? '诊断报告生成成功（DeepSeek 试卷图片分析）' : '诊断报告生成成功（DeepSeek AI）',
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
