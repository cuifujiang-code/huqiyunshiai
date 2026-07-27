/** 拍照搜题结构化 JSON 提示（teacher-api 服务端） */

export const PHOTO_SEARCH_SYSTEM_PROMPT = `你是 K12 拍照搜题助手。根据 OCR 识别的题目文字，输出结构化解答。
若提供了「题库匹配题」且高度相关，优先采用题库标准答案与解析，source 设为 "bank"。
数学公式必须使用 LaTeX 并带定界符：行内 $...$，独立一行 $$...$$。禁止输出未包裹的 P_{i}、\\sum、\\frac 等裸 LaTeX。
只输出 JSON，不要 markdown 代码块：
{
  "question": "规范化后的完整题干（公式用 $...$ 或 $$...$$）",
  "answer": "最终答案（公式用 LaTeX）",
  "thinkingAnalysis": "思路分析：解题切入点、关键条件、整体策略（2-4 句，可含公式）",
  "stepSolution": "步骤解答：分步编号，每步一行，如 1. ...\\n2. ...（公式用 LaTeX）",
  "knowledgeSummary": "知识总结：本题考查的核心知识点、方法、易错点（一段话）",
  "knowledgePoints": ["知识点1", "知识点2"],
  "similarRecommendations": [
    { "title": "同类题型简述", "reason": "推荐理由" }
  ],
  "source": "bank 或 ai",
  "bankQuestionId": "题库题目 id 或 null"
}`

export function buildSimilarRecommendations(candidates, excludeId, limit = 3) {
  return (candidates || [])
    .filter((c) => String(c.id) !== String(excludeId ?? ''))
    .slice(0, limit)
    .map((c) => ({
      title: String(c.content || '同类题').slice(0, 100) + (c.content?.length > 100 ? '…' : ''),
      reason: c.knowledge_point
        ? `考查：${c.knowledge_point}`
        : `题库相似度 ${((c._score || 0) * 100).toFixed(0)}%`,
      bankQuestionId: String(c.id),
      subject: c.subject || undefined,
    }))
}

export function inferThinkingFromAnalysis(analysis, question) {
  const a = String(analysis || '').trim()
  if (a) {
    const first = a.split(/\n\n|\n(?=\d+[.)）])|\n(?=第[一二三四五六七八九十\d]+步)/)[0]?.trim()
    if (first && first.length >= 12 && first.length <= 400) return first
  }
  const q = String(question || '').trim().slice(0, 120)
  if (q) {
    return `先通读题干，提取已知条件与所求量${q.includes('证明') ? '，明确证明目标' : ''}，再选择合适模型或公式建立关系。`
  }
  return '先从题意与已知条件入手，明确求解目标，再选择合适的公式或方法逐步推导。'
}

export function buildKnowledgeSummaryText(knowledgePoints, analysis) {
  const tags = (knowledgePoints || []).filter(Boolean)
  if (tags.length) {
    return `本题考查 ${tags.join('、')}。建议回顾相关定义、公式及常见变形，并整理易错点。`
  }
  const hint = String(analysis || '').match(/考查[^。\n]{4,40}|涉及[^。\n]{4,40}/)?.[0]
  if (hint) return `${hint}。请结合本题解法归纳同类题的一般步骤。`
  return '建议回顾本题所用方法与公式，整理同类题型的通用解题步骤与注意事项。'
}

export function enrichPhotoSearchResult(base, candidates = []) {
  const analysis = base.analysis || ''
  const stepSolution = base.stepSolution || analysis
  const thinkingAnalysis = base.thinkingAnalysis || inferThinkingFromAnalysis(analysis, base.question)
  const knowledgeSummary =
    base.knowledgeSummary || buildKnowledgeSummaryText(base.knowledgePoints, analysis)
  const similarRecommendations =
    base.similarRecommendations?.length > 0
      ? base.similarRecommendations
      : buildSimilarRecommendations(candidates, base.bankQuestionId)

  return {
    ...base,
    analysis: analysis || stepSolution,
    stepSolution,
    thinkingAnalysis,
    knowledgeSummary,
    similarRecommendations,
  }
}

export function parseStructuredPhotoSearchJson(parsed, ocrText, candidates) {
  const bankId = parsed.bankQuestionId ? String(parsed.bankQuestionId) : null
  const matched =
    bankId && candidates.find((c) => String(c.id) === bankId)
      ? candidates.find((c) => String(c.id) === bankId)
      : null

  const knowledgePoints = Array.isArray(parsed.knowledgePoints) ? parsed.knowledgePoints : []

  if (parsed.source === 'bank' && matched) {
    const bankBase = {
      ocrText,
      question: parsed.question || matched.content,
      answer: parsed.answer || matched.answer || '',
      analysis: parsed.stepSolution || parsed.analysis || matched.analysis || '',
      thinkingAnalysis: parsed.thinkingAnalysis,
      stepSolution: parsed.stepSolution || parsed.analysis || matched.analysis || '',
      knowledgeSummary: parsed.knowledgeSummary,
      knowledgePoints: knowledgePoints.length
        ? knowledgePoints
        : matched.knowledge_point
          ? String(matched.knowledge_point)
              .split(/[,，;；]/)
              .map((s) => s.trim())
              .filter(Boolean)
          : [],
      similarRecommendations: parsed.similarRecommendations,
      source: 'bank',
      bankQuestionId: String(matched.id),
      bankTable: matched._table,
      matchedQuestion: {
        id: matched.id,
        content: matched.content,
        answer: matched.answer,
        analysis: matched.analysis,
        knowledge_point: matched.knowledge_point,
        table: matched._table,
      },
      similarity: matched._score,
    }
    return enrichPhotoSearchResult(bankBase, candidates)
  }

  return enrichPhotoSearchResult(
    {
      ocrText,
      question: parsed.question || ocrText,
      answer: parsed.answer || '',
      analysis: parsed.stepSolution || parsed.analysis || '',
      thinkingAnalysis: parsed.thinkingAnalysis,
      stepSolution: parsed.stepSolution || parsed.analysis || '',
      knowledgeSummary: parsed.knowledgeSummary,
      knowledgePoints,
      similarRecommendations: parsed.similarRecommendations,
      source: 'ai',
      bankQuestionId: bankId,
      bankTable: matched?._table ?? null,
      matchedQuestion: matched
        ? {
            id: matched.id,
            content: matched.content,
            answer: matched.answer,
            analysis: matched.analysis,
            knowledge_point: matched.knowledge_point,
            table: matched._table,
          }
        : null,
      similarity: matched?._score ?? 0,
    },
    candidates,
  )
}

function splitKnowledgePoints(raw) {
  if (!raw) return []
  return String(raw)
    .split(/[,，;；]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

export function mapBankHitForOrchestrator(best, ocrText, candidates = []) {
  return enrichPhotoSearchResult(
    {
      ocrText,
      question: best.content || ocrText,
      answer: best.answer || '暂无',
      analysis: best.analysis || '暂无',
      knowledgePoints: splitKnowledgePoints(best.knowledge_point),
      source: 'bank',
      bankQuestionId: String(best.id),
      bankTable: best._table,
      matchedQuestion: {
        id: best.id,
        content: best.content,
        answer: best.answer,
        analysis: best.analysis,
        knowledge_point: best.knowledge_point,
        table: best._table,
      },
      similarity: best._score,
    },
    candidates,
  )
}
