import { mockPressureExam } from './mockExamData.js'

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
      "knowledgeTags": ["知识点1", "知识点2"],
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

function extractJson(text) {
  const trimmed = text.trim()
  const codeBlock = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlock) return codeBlock[1].trim()

  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1)
  return trimmed
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
  }
}

async function callQiniuAI(prompt) {
  const apiKey = process.env.QINIUAI_API_KEY
  const apiBase = (process.env.QINIUAI_API_URL || 'https://api.qnaigc.com/v1').replace(/\/$/, '')
  const model = process.env.QINIUAI_MODEL || 'deepseek-v3'

  if (!apiKey) {
    throw new Error('QINIUAI_API_KEY 未配置')
  }

  const url = apiBase.includes('/chat/completions')
    ? apiBase
    : `${apiBase}/chat/completions`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content: '你是专业的 K12 试卷出题专家，只输出合法 JSON，不使用 markdown 格式。',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 4096,
      stream: false,
    }),
    signal: AbortSignal.timeout(120000),
  })

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`七牛云 AI 请求失败 (${response.status}): ${errText.slice(0, 200)}`)
  }

  const data = await response.json()
  const content = data?.choices?.[0]?.message?.content
  if (!content) throw new Error('七牛云 AI 未返回有效内容')
  return content
}

export async function generateExam(params) {
  const meta = {
    subject: params.subject,
    grade: params.grade,
    difficulty: params.difficulty,
  }

  try {
    const aiPrompt = buildPrompt(params)
    const aiContent = await callQiniuAI(aiPrompt)
    const parsed = JSON.parse(extractJson(aiContent))
    const exam = normalizeExam(parsed, meta)
    return { exam: { ...exam, source: 'ai' }, message: '试卷生成成功（七牛云 AI）' }
  } catch (error) {
    console.warn('七牛云 AI 不可用，使用演示数据:', error instanceof Error ? error.message : error)
    const exam = {
      ...mockPressureExam,
      subject: params.subject || mockPressureExam.subject,
      grade: params.grade || mockPressureExam.grade,
      difficulty: params.difficulty || mockPressureExam.difficulty,
      source: 'mock',
    }
    return {
      exam,
      message: '七牛云 AI 暂不可用，已加载压强单元测试演示试卷',
    }
  }
}
