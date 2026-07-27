/**
 * 题目 OCR / 占位符二次精修（DeepSeek 文本校正）
 * 供 ocr-correct API 与上传拆题后处理复用
 */
import { callDeepSeekAI, getDeepSeekConfig } from '../deepseekClient.js'
import { repairJSON } from './jsonRepairEngine.js'

const MAX_CONTENT_LENGTH = 10000
const REQUEST_TIMEOUT_MS = 45000

function buildRepairSystemPrompt() {
  return `你是 K12 题目 OCR 与拆题后精修专家。修正识别错误，并补全公式/图片占位符。

## 必须处理
1. **【公式】/【公式待补】** → 根据上下文推断并替换为标准 LaTeX（行内 $...$，独立 $$...$$），禁止保留占位符
2. **[图片占位符]/【图片】** → 保留占位符或在 analysis 注明「此题包含图片，需手动处理」
3. **LaTeX 格式** → 修复错误命令、未闭合括号、希腊字母拼写
4. **残缺题干** → 根据上下文补全断句、错字（0/O、1/l 等）

## 输出格式（仅 JSON，无 markdown）
{
  "content": "校正后题干",
  "answer": "校正后答案",
  "analysis": "校正后解析",
  "hasImage": false,
  "confidence": 0.95,
  "corrections": []
}

规则：保留原意，不删题；无需修改时原样返回且 confidence=1.0`
}

function buildRepairUserPrompt({ content, answer, analysis, subject, grade }) {
  const parts = ['请精修以下题目（重点处理公式占位符与 LaTeX）：\n']
  if (subject || grade) {
    parts.push(`学科：${subject || '未指定'}，年级：${grade || '未指定'}\n`)
  }
  if (content) parts.push(`**题目内容：**\n${content}\n`)
  if (answer) parts.push(`**答案：**\n${answer}\n`)
  if (analysis) parts.push(`**解析：**\n${analysis}\n`)
  parts.push('\n只输出 JSON。')
  return parts.join('')
}

function parseRepairResponse(aiContent, fallback) {
  const trimmed = String(aiContent ?? '').trim()
  const jsonMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  const jsonStr = jsonMatch ? jsonMatch[1].trim() : trimmed

  try {
    const parsed = typeof jsonStr === 'string' && jsonStr.startsWith('{')
      ? JSON.parse(jsonStr)
      : repairJSON(jsonStr)
    return {
      content: String(parsed.content ?? fallback.content ?? '').trim() || fallback.content,
      answer: String(parsed.answer ?? fallback.answer ?? '').trim() || fallback.answer,
      analysis: String(parsed.analysis ?? fallback.analysis ?? '').trim() || fallback.analysis,
      hasImage: Boolean(parsed.hasImage),
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
      corrections: Array.isArray(parsed.corrections) ? parsed.corrections : [],
      repaired: true,
    }
  } catch (err) {
    console.warn('[questionOcrRepair] 解析失败，保留原文', {
      error: err instanceof Error ? err.message : String(err),
      preview: trimmed.slice(0, 300),
    })
    return { ...fallback, confidence: 0, corrections: [], repaired: false }
  }
}

/**
 * 单题文本二次精修
 * @returns {Promise<{ content, answer, analysis, confidence, corrections, repaired, isMockFallback? }>}
 */
export async function repairQuestionFields(fields, meta = {}) {
  const fallback = {
    content: (fields.content || '').slice(0, MAX_CONTENT_LENGTH),
    answer: (fields.answer || '').slice(0, MAX_CONTENT_LENGTH),
    analysis: (fields.analysis || '').slice(0, MAX_CONTENT_LENGTH),
  }

  const dsConfig = getDeepSeekConfig()
  if (!dsConfig.hasApiKey) {
    return { ...fallback, confidence: 0, corrections: [], repaired: false, isMockFallback: true }
  }

  try {
    const aiContent = await callDeepSeekAI(
      buildRepairSystemPrompt(),
      buildRepairUserPrompt({ ...fallback, subject: meta.subject, grade: meta.grade }),
      {
        maxTokens: 4096,
        temperature: 0.25,
        timeoutMs: REQUEST_TIMEOUT_MS,
        label: 'decompose-post-repair',
      },
    )
    return parseRepairResponse(aiContent, fallback)
  } catch (err) {
    console.warn('[questionOcrRepair] DeepSeek 调用失败', {
      message: err instanceof Error ? err.message : String(err),
    })
    return { ...fallback, confidence: 0, corrections: [], repaired: false, isMockFallback: true }
  }
}
