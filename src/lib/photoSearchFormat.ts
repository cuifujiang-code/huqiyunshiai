import type { PhotoSearchResult, SimilarQuestionRecommendation } from '../types/photoSearch'

export interface PhotoSearchSections {
  thinking: string
  steps: string
  knowledgeSummary: string
  similarQuestions: SimilarQuestionRecommendation[]
}

/** 将步骤文本拆分为多条（识别 1. / (1) / 第一步 等） */
export function splitSolutionSteps(text: string): string[] {
  const raw = String(text ?? '').trim()
  if (!raw) return []

  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean)
  const steps: string[] = []
  let current: string[] = []
  const stepStart = /^(\d+[.)）]\s*|第[一二三四五六七八九十\d]+步[：:.\s]*|[（(]\d+[)）]\s*)/

  for (const line of lines) {
    if (stepStart.test(line)) {
      if (current.length) steps.push(current.join('\n'))
      current = [line.replace(stepStart, '').trim() || line]
    } else {
      current.push(line)
    }
  }
  if (current.length) steps.push(current.join('\n'))

  return steps.length > 1 ? steps : []
}

function inferThinking(analysis: string, question: string): string {
  const a = analysis.trim()
  if (a) {
    const first = a.split(/\n\n|\n(?=\d+[.)）])|\n(?=第[一二三四五六七八九十\d]+步)/)[0]?.trim()
    if (first && first.length >= 12 && first.length <= 400 && !/^(故|因此|所以|答)/.test(first)) {
      return first
    }
  }
  const q = question.trim().slice(0, 120)
  if (q) {
    return `先通读题干，提取已知条件与所求量${q.includes('证明') ? '，明确证明目标' : ''}，再选择合适模型或公式建立关系。`
  }
  return '先从题意与已知条件入手，明确求解目标，再选择合适的公式或方法逐步推导。'
}

function buildKnowledgeSummary(knowledgePoints: string[], analysis: string): string {
  const tags = knowledgePoints.filter(Boolean)
  if (tags.length) {
    return `本题考查 ${tags.join('、')}。建议回顾相关定义、公式及常见变形，并整理易错点。`
  }
  const hint = analysis.match(/考查[^。\n]{4,40}|涉及[^。\n]{4,40}/)?.[0]
  if (hint) return `${hint}。请结合本题解法归纳同类题的一般步骤。`
  return '建议回顾本题所用方法与公式，整理同类题型的通用解题步骤与注意事项。'
}

function buildSimilarFromBank(result: PhotoSearchResult): SimilarQuestionRecommendation[] {
  if (result.similarRecommendations?.length) return result.similarRecommendations
  const matched = result.matchedQuestion as Record<string, unknown> | null
  if (!matched) return []
  return []
}

/** 统一将 API/历史记录转为四段式展示结构 */
export function normalizePhotoSearchSections(result: PhotoSearchResult): PhotoSearchSections {
  const analysis = result.analysis?.trim() || ''
  const steps = result.stepSolution?.trim() || analysis
  const thinking = result.thinkingAnalysis?.trim() || inferThinking(analysis, result.question)
  const knowledgeSummary =
    result.knowledgeSummary?.trim() || buildKnowledgeSummary(result.knowledgePoints, analysis)

  let similarQuestions = result.similarRecommendations?.length
    ? result.similarRecommendations
    : buildSimilarFromBank(result)

  if (!similarQuestions.length && result.knowledgePoints.length) {
    similarQuestions = result.knowledgePoints.slice(0, 3).map((kp) => ({
      title: `巩固练习：${kp}`,
      reason: '与本题知识点相关，建议加强训练',
    }))
  }

  return { thinking, steps, knowledgeSummary, similarQuestions }
}

/** 合并结构化字段到结果（后端返回新字段时使用） */
export function mergeStructuredPhotoResult(
  base: PhotoSearchResult,
  extra: Partial<PhotoSearchResult>,
): PhotoSearchResult {
  const merged = { ...base, ...extra }
  const sections = normalizePhotoSearchSections(merged)
  return {
    ...merged,
    thinkingAnalysis: extra.thinkingAnalysis ?? sections.thinking,
    stepSolution: extra.stepSolution ?? sections.steps,
    knowledgeSummary: extra.knowledgeSummary ?? sections.knowledgeSummary,
    similarRecommendations: extra.similarRecommendations ?? sections.similarQuestions,
    analysis: merged.analysis || sections.steps,
  }
}
