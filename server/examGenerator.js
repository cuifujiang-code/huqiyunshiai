import { buildMockPressureExam } from './mockExamData.js'
import { callDeepSeekAI, extractJson } from './deepseekClient.js'

const EXAM_JSON_SCHEMA = `{
  "title": "试卷标题",
  "duration": 90,
  "totalScore": 100,
  "subject": "学科",
  "grade": "年级",
  "difficulty": "难度",
  "questions": [
    {
      "id": 1,
      "type": "选择题|填空题|计算题|简答题|实验题",
      "content": "题目内容",
      "options": ["A. 选项1", "B. 选项2", "C. 选项3", "D. 选项4"],
      "answer": "正确答案",
      "analysis": "详细解析",
      "knowledgeTags": ["知识点1"],
      "score": 5
    }
  ]
}`

function buildPrompt({ prompt, subject, grade, difficulty }) {
  return `你是一位资深${subject}教师，请根据以下要求生成一套完整的试卷。

【用户需求】
${prompt}

【基本参数】
- 学科：${subject}
- 年级：${grade}
- 难度：${difficulty}

【输出要求】
1. 只返回 JSON，不要包含 markdown 代码块或其他文字
2. 严格遵循以下 JSON 结构：
${EXAM_JSON_SCHEMA}
3. 选择题必须包含 4 个选项（A/B/C/D 格式）
4. 填空题、计算题不需要 options 字段
5. 每道题必须有 answer、analysis、knowledgeTags
6. 题号 id 从 1 开始连续递增
7. totalScore 等于所有题目 score 之和`
}

function normalizeExam(raw, fallbackMeta) {
  if (!raw?.title || !Array.isArray(raw.questions) || raw.questions.length === 0) {
    throw new Error('AI 返回的试卷格式不完整')
  }

  const questions = raw.questions.map((q, index) => ({
    id: q.id ?? index + 1,
    type: q.type,
    content: q.content,
    options: Array.isArray(q.options) ? q.options : undefined,
    answer: String(q.answer ?? ''),
    analysis: String(q.analysis ?? ''),
    knowledgeTags: Array.isArray(q.knowledgeTags) ? q.knowledgeTags : [],
    score: Number(q.score) || undefined,
  }))

  return {
    title: raw.title,
    duration: Number(raw.duration) || 90,
    totalScore: Number(raw.totalScore) || questions.reduce((s, q) => s + (q.score || 0), 0),
    subject: raw.subject || fallbackMeta.subject,
    grade: raw.grade || fallbackMeta.grade,
    difficulty: raw.difficulty || fallbackMeta.difficulty,
    questions,
    source: 'ai',
  }
}

const MOCK_FALLBACK_MESSAGE = 'AI服务暂不可用，已展示示例试卷'

export async function generateExam(params) {
  const meta = {
    subject: params.subject,
    grade: params.grade,
    difficulty: params.difficulty,
  }

  try {
    const aiPrompt = buildPrompt(params)
    const aiContent = await callDeepSeekAI(
      '你是专业的 K12 试卷出题专家，只输出合法 JSON，不使用 markdown 格式。',
      aiPrompt,
    )
    const parsed = JSON.parse(extractJson(aiContent))
    const exam = normalizeExam(parsed, meta)
    return {
      exam,
      message: '试卷生成成功（DeepSeek AI）',
      isMockFallback: false,
    }
  } catch (error) {
    console.warn('DeepSeek AI 不可用，使用演示数据:', error instanceof Error ? error.message : error)
    const exam = buildMockPressureExam({
      subject: params.subject,
      grade: params.grade,
      difficulty: params.difficulty,
    })
    return {
      exam,
      message: MOCK_FALLBACK_MESSAGE,
      isMockFallback: true,
    }
  }
}

export { MOCK_FALLBACK_MESSAGE }
