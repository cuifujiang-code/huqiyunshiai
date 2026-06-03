/**
 * OCR 精修校正 API — POST /api/teacher/questions/ocr-correct
 *
 * 接收 OCR 识别后的题目内容，调用 DeepSeek API 进行二次校正：
 *   - 修复 LaTeX 公式格式错误
 *   - 补全残缺题干
 *   - 识别并标记图片位置
 *   - 返回校正后的结构化内容
 *
 * 降级策略：DeepSeek 不可用时返回原始内容并标记 isMockFallback: true
 */

import { callDeepSeekAI } from '../deepseekClient.js'
import { getDeepSeekConfig } from '../deepseekClient.js'

const MAX_CONTENT_LENGTH = 10000
const REQUEST_TIMEOUT_MS = 30000

/**
 * 构建系统提示词 — 指导 AI 进行 OCR 题目校正
 * 使用字符串数组 join，完全避免模板字符串中的反引号冲突
 */
function buildOcrCorrectSystemPrompt() {
  const L = []
  L.push('你是一位专业的题目 OCR 校正专家。你的任务是修正 OCR（光学字符识别）识别后的题目文本中的错误。')
  L.push('')
  L.push('## 需要修正的问题')
  L.push('')
  L.push('1. **LaTeX 公式格式错误**')
  L.push('   - 修复缺失的 $ 或 $$ 分隔符')
  L.push('   - 修正错误的 LaTeX 命令（如 \\frac 写成 \\frc、\\sqrt 写成 \\sqt）')
  L.push('   - 补全未闭合的括号、花括号')
  L.push('   - 确保上标 ^ 和下标 _ 格式正确')
  L.push('   - 希腊字母拼写错误修正（如 \\alpha 写成 \\alp、\\beta 写成 \\bet）')
  L.push('')
  L.push('2. **残缺题干补全**')
  L.push('   - 根据上下文推断并补全缺失的文字')
  L.push('   - 修复断句、断词问题')
  L.push('   - 恢复被错误识别的数字、字母（如 0<->O、1<->l、5<->S）')
  L.push('')
  L.push('3. **图片位置标记**')
  L.push('   - 识别题目中应该出现图片的位置')
  L.push('   - 用 【图片】 占位符标记图片位置')
  L.push('   - 在 analysis 字段中用 【图片说明：...】 描述图片内容')
  L.push('')
  L.push('4. **通用 OCR 错误修正**')
  L.push('   - 错别字修正')
  L.push('   - 标点符号修复（中文标点、英文标点混淆）')
  L.push('   - 换行符、空格错误修正')
  L.push('   - 表格结构修复（用 Markdown 表格格式）')
  L.push('')
  L.push('## 输出格式')
  L.push('')
  L.push('严格按以下 JSON 格式返回，不要添加任何解释性文字：')
  L.push('')
  L.push('```json')
  L.push('{')
  L.push('  "content": "校正后的题目内容（含正确 LaTeX 公式）",')
  L.push('  "answer": "校正后的答案（如无需校正原样返回）",')
  L.push('  "analysis": "校正后的解析（如无需校正原样返回）",')
  L.push('  "hasImage": true,')
  L.push('  "imageDescriptions": ["图片1描述", "图片2描述"],')
  L.push('  "confidence": 0.95,')
  L.push('  "corrections": [')
  L.push('    { "type": "latex", "original": "错误片段", "corrected": "正确片段", "reason": "说明" },')
  L.push('    { "type": "text", "original": "错误片段", "corrected": "正确片段", "reason": "说明" }')
  L.push('  ]')
  L.push('}')
  L.push('```')
  L.push('')
  L.push('## 重要规则')
  L.push('')
  L.push('- 保留所有原始题意，只修正识别错误')
  L.push('- LaTeX 公式必须用 $ 或 $$ 包裹')
  L.push('- 不要删除或添加题目内容')
  L.push('- confidence 字段表示校正置信度（0-1 之间）')
  L.push('- corrections 数组记录所有修正点，方便前端展示')
  L.push('- 如果内容无需校正，返回原始内容并将 confidence 设为 1.0')
  L.push('')
  L.push('## 示例')
  L.push('')
  L.push('输入：')
  L.push('```')
  L.push('{ "content": "已知函数 f(x) = \\frac{1}{x-1}，求 f\'(x)。" }')
  L.push('```')
  L.push('')
  L.push('输出：')
  L.push('```json')
  L.push('{ "content": "已知函数 $f(x) = \\frac{1}{x-1}$，求 $f\'(x)$。", "confidence": 0.98 }')
  L.push('```')
  return L.join('\n')
}

/**
 * 构建用户提示词 — 将题目内容传递给 AI
 */
function buildOcrCorrectUserPrompt({ content, answer, analysis }) {
  const parts = []
  parts.push('请校正以下 OCR 识别后的题目内容：\n')

  if (content) {
    parts.push(`**题目内容：**\n${content}\n`)
  }

  if (answer) {
    parts.push(`**答案：**\n${answer}\n`)
  }

  if (analysis) {
    parts.push(`**解析：**\n${analysis}\n`)
  }

  parts.push('\n请按指定 JSON 格式返回校正结果。')

  return parts.join('')
}

/**
 * 降级模式 — DeepSeek 不可用时返回原始内容
 */
function buildFallbackResponse(questionData) {
  return {
    success: true,
    data: {
      content: questionData.content || '',
      answer: questionData.answer || '',
      analysis: questionData.analysis || '',
      hasImage: false,
      imageDescriptions: [],
      confidence: 0.0,
      corrections: [],
    },
    isMockFallback: true,
    message: 'DeepSeek API 不可用，返回原始内容（降级模式）',
  }
}

/**
 * 解析 AI 返回的 JSON 结果
 */
function parseAiResponse(aiContent) {
  // 尝试提取 JSON（可能在代码块中）
  const jsonMatch = aiContent.match(/```(?:json)?\s*([\s\S]*?)```/)
  let jsonStr = jsonMatch ? jsonMatch[1].trim() : aiContent.trim()

  // 尝试直接解析
  try {
    const parsed = JSON.parse(jsonStr)
    return {
      content: parsed.content || '',
      answer: parsed.answer || '',
      analysis: parsed.analysis || '',
      hasImage: Boolean(parsed.hasImage),
      imageDescriptions: Array.isArray(parsed.imageDescriptions) ? parsed.imageDescriptions : [],
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
      corrections: Array.isArray(parsed.corrections) ? parsed.corrections : [],
    }
  } catch (parseErr) {
    console.error('[OCR Correct] AI 返回解析失败', { error: parseErr.message, aiContent: aiContent.slice(0, 500) })

    // 降级：尝试提取各个字段
    const contentMatch = aiContent.match(/"content"\s*:\s*"([^"]*(?:[^"\\]|\\.)*)"/)
    const answerMatch = aiContent.match(/"answer"\s*:\s*"([^"]*(?:[^"\\]|\\.)*)"/)
    const analysisMatch = aiContent.match(/"analysis"\s*:\s*"([^"]*(?:[^"\\]|\\.)*)"/)

    return {
      content: contentMatch ? contentMatch[1].replace(/\\"/g, '"') : '',
      answer: answerMatch ? answerMatch[1].replace(/\\"/g, '"') : '',
      analysis: analysisMatch ? analysisMatch[1].replace(/\\"/g, '"') : '',
      hasImage: false,
      imageDescriptions: [],
      confidence: 0.3,
      corrections: [],
    }
  }
}

/**
 * 主处理函数 — POST /api/teacher/questions/ocr-correct
 */
export default async function ocrCorrectApi(req, res) {
  // 只允许 POST 请求
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      message: '仅支持 POST 请求',
      isMockFallback: false,
    })
  }

  const startTime = Date.now()
  console.log('[OCR Correct] 请求开始', { method: req.method, url: req.url })

  try {
    // 解析请求体
    let body = req.body
    if (!body) {
      const chunks = []
      for await (const chunk of req) {
        chunks.push(chunk)
      }
      const rawBody = Buffer.concat(chunks).toString('utf8')
      body = JSON.parse(rawBody)
    }

    const { questionId, content, answer, analysis } = body

    // 参数校验
    if (!content && !answer && !analysis) {
      return res.status(400).json({
        success: false,
        message: '至少需要提供 content、answer、analysis 中的一个',
        isMockFallback: false,
      })
    }

    // 截断过长内容
    const questionData = {
      questionId: questionId || null,
      content: (content || '').slice(0, MAX_CONTENT_LENGTH),
      answer: (answer || '').slice(0, MAX_CONTENT_LENGTH),
      analysis: (analysis || '').slice(0, MAX_CONTENT_LENGTH),
    }

    // 检查 DeepSeek 配置
    const dsConfig = getDeepSeekConfig()
    if (!dsConfig.hasApiKey) {
      console.warn('[OCR Correct] DeepSeek API Key 未配置，使用降级模式')
      return res.status(200).json(buildFallbackResponse(questionData))
    }

    // 调用 DeepSeek API
    const systemPrompt = buildOcrCorrectSystemPrompt()
    const userPrompt = buildOcrCorrectUserPrompt(questionData)

    let aiContent
    try {
      aiContent = await callDeepSeekAI(systemPrompt, userPrompt, {
        maxTokens: 4096,
        temperature: 0.3,
        timeoutMs: REQUEST_TIMEOUT_MS,
        label: 'OCR-Correct',
      })
    } catch (aiErr) {
      console.error('[OCR Correct] DeepSeek API 调用失败', {
        error: aiErr.message,
        questionId: questionData.questionId,
      })

      // AI 调用失败，返回降级结果
      const fallback = buildFallbackResponse(questionData)
      fallback.message = `DeepSeek API 调用失败：${aiErr.message}，返回原始内容（降级模式）`
      return res.status(200).json(fallback)
    }

    // 解析 AI 返回结果
    const correctedData = parseAiResponse(aiContent)

    const elapsedMs = Date.now() - startTime
    console.log('[OCR Correct] 校正完成', {
      questionId: questionData.questionId,
      elapsedMs,
      confidence: correctedData.confidence,
      correctionsCount: correctedData.corrections.length,
    })

    // 返回成功响应
    return res.status(200).json({
      success: true,
      data: correctedData,
      isMockFallback: false,
      questionId: questionData.questionId,
      message: 'OCR 校正完成',
      meta: {
        elapsedMs,
        model: dsConfig.model,
        correctionsCount: correctedData.corrections.length,
      },
    })

  } catch (err) {
    const elapsedMs = Date.now() - startTime
    console.error('[OCR Correct] 处理异常', {
      error: err.message,
      stack: err.stack?.split('\n').slice(0, 3),
      elapsedMs,
    })

    return res.status(500).json({
      success: false,
      message: `OCR 校正失败：${err.message}`,
      isMockFallback: false,
      error: process.env.NODE_ENV === 'development' ? {
        message: err.message,
        stack: err.stack,
      } : undefined,
    })
  }
}
