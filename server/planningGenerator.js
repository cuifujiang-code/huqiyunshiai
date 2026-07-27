import { buildMockPlanningReport } from './mockPlanningData.js'
import { callDeepSeekAI, extractJson, serializeError } from './deepseekClient.js'
import { buildKnowledgeSystemPrompt } from './knowledgeBase.js'
import {
  HUQI_PLANNING_SYSTEM_PROMPT,
  fetchPlanningStudentContext,
  formatPlanningStudentContextBlock,
  buildEnrichedUserPromptSections,
} from './planning/planningPrompts.js'

const MOCK_FALLBACK_MESSAGE = 'AI服务暂不可用，已展示示例教育规划方案'

const PLANNING_JSON_SCHEMA = `{
  "title": "规划方案标题",
  "generatedAt": "ISO8601时间",
  "studentProfile": {
    "name": "姓名",
    "grade": "年级",
    "scoreLevel": "成绩水平",
    "goalDirections": ["目标方向"],
    "interests": ["兴趣标签"],
    "parentExpectations": "家长期望",
    "specialNotes": "特殊需求"
  },
  "abilityDimensions": [
    { "label": "逻辑思维|语言表达|数理能力|创新能力|应试技巧|自主学习", "score": 0-100 }
  ],
  "stageGoals": [
    {
      "period": "时间段",
      "phase": "阶段名称",
      "coreTasks": ["核心任务"],
      "expectedOutcomes": ["预期成果"]
    }
  ],
  "subjectPaths": [
    {
      "subject": "学科",
      "importance": 1-5,
      "timePercent": 百分比数字,
      "keyKnowledgePoints": ["知识点"],
      "resourceTypes": ["资源类型"]
    }
  ],
  "phaseTasks": [
    {
      "phase": "学期/阶段",
      "tasks": [
        {
          "name": "任务名称",
          "criteria": "完成标准",
          "duration": "建议时长",
          "knowledgePoints": ["关联知识点"],
          "relatedExercises": ["关联试卷/练习"]
        }
      ]
    }
  ],
  "milestones": [
    { "date": "时间", "event": "节点事件", "preparationAdvice": "准备建议" }
  ],
  "risks": [
    { "risk": "风险描述", "impact": "高|中|低", "mitigation": "备选方案或补救措施" }
  ],
  "professionalReport": {
    "diagnosis": "现状诊断100字以内",
    "recommendedPaths": [
      { "type": "main", "path": "主路径", "reason": "理由" },
      { "type": "backup", "path": "备选路径", "reason": "理由" },
      { "type": "fallback", "path": "保底路径", "reason": "理由" }
    ],
    "keyTimeline": [{ "month": "2025年9月", "event": "事件", "note": "说明" }],
    "actionList90Days": ["任务1", "任务2", "任务3", "任务4", "任务5", "任务6"],
    "riskAlerts": ["风险提示"]
  }
}`

function buildUserPrompt(form, studentContextBlock = '') {
  const enhanced = form._enhanced ?? {}
  const enriched = buildEnrichedUserPromptSections(form, enhanced, studentContextBlock)
  return `请为以下学生生成完整的教育规划方案 JSON。

${enriched}

【输出要求】
1. 只返回 JSON，不要 markdown 代码块
2. 必须包含 professionalReport 五大模块（现状诊断、三条路径、时间节点、90天行动清单、风险提示）
3. 严格遵循以下结构（6大模块全部包含）：
${PLANNING_JSON_SCHEMA}
4. abilityDimensions 必须包含6个维度且 score 为 0-100 整数
5. stageGoals 至少3个节点，形成时间轴
6. subjectPaths 至少4个学科
7. phaseTasks 至少2个阶段，每阶段至少2个任务
8. milestones 至少4个关键节点，时间精确到月份
9. risks 至少2条，需结合该生实际情况
10. 针对浙江新高考选科说明对专业报考的影响`
}

export function normalizeReport(raw, form) {
  if (!raw?.title || !raw?.studentProfile || !Array.isArray(raw.stageGoals)) {
    throw new Error('AI 返回的规划方案格式不完整')
  }

  const fallback = buildMockPlanningReport(form)

  return {
    title: raw.title || fallback.title,
    generatedAt: raw.generatedAt || new Date().toISOString(),
    studentProfile: {
      ...fallback.studentProfile,
      ...raw.studentProfile,
      name: raw.studentProfile?.name || form.studentName,
      grade: raw.studentProfile?.grade || form.grade,
    },
    abilityDimensions:
      Array.isArray(raw.abilityDimensions) && raw.abilityDimensions.length >= 5
        ? raw.abilityDimensions.map((d) => ({
            label: d.label,
            score: Math.min(100, Math.max(0, Number(d.score) || 0)),
          }))
        : fallback.abilityDimensions,
    stageGoals: raw.stageGoals?.length >= 2 ? raw.stageGoals : fallback.stageGoals,
    subjectPaths: raw.subjectPaths?.length >= 3 ? raw.subjectPaths : fallback.subjectPaths,
    phaseTasks: raw.phaseTasks?.length >= 1 ? raw.phaseTasks : fallback.phaseTasks,
    milestones: raw.milestones?.length >= 2 ? raw.milestones : fallback.milestones,
    risks: raw.risks?.length >= 1 ? raw.risks : fallback.risks,
    source: 'ai',
  }
}

export async function generatePlanning(form) {
  try {
    const studentContext = await fetchPlanningStudentContext(
      form.studentUserId || form.userId,
    )
    const studentContextBlock = formatPlanningStudentContextBlock(studentContext)
    const systemPrompt = `${HUQI_PLANNING_SYSTEM_PROMPT}\n\n${buildKnowledgeSystemPrompt()}`
    const aiContent = await callDeepSeekAI(
      systemPrompt,
      buildUserPrompt(form, studentContextBlock),
    )
    const parsed = JSON.parse(extractJson(aiContent))
    const report = normalizeReport(parsed, form)
    return {
      report,
      message: '教育规划方案生成成功（DeepSeek AI）',
      isMockFallback: false,
    }
  } catch (error) {
    const errorDetail = serializeError(error)
    console.error('[规划生成] DeepSeek AI 不可用，使用演示数据:', errorDetail)
    const report = buildMockPlanningReport(form)
    return {
      report,
      message: MOCK_FALLBACK_MESSAGE,
      isMockFallback: true,
      errorDetail,
    }
  }
}

export { MOCK_FALLBACK_MESSAGE }
