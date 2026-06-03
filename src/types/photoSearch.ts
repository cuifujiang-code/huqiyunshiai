export type PhotoSearchSource = 'bank' | 'ai'

/** 搜题四种结果状态 */
export type SearchStatus = 'success' | 'no_match' | 'blurry' | 'network_error'

export interface PhotoSearchResult {
  ocrText: string
  question: string
  answer: string
  analysis: string
  knowledgePoints: string[]
  source: PhotoSearchSource
  bankQuestionId: string | null
  bankTable: string | null
  matchedQuestion: Record<string, unknown> | null
  similarity?: number
  historyId?: string | null
  isMockFallback?: boolean
  /** 搜题状态码，前端据此切换 UI */
  searchStatus?: SearchStatus
}

export interface PhotoSearchHistoryItem {
  id: string
  user_id: string | null
  image_name: string
  ocr_text: string
  question: string
  answer: string
  analysis: string
  knowledge_points: string[]
  source: PhotoSearchSource
  bank_question_id: string | null
  bank_table: string | null
  matched_question: Record<string, unknown> | null
  created_at: string
}

export function historyItemToResult(item: PhotoSearchHistoryItem): PhotoSearchResult {
  return {
    ocrText: item.ocr_text,
    question: item.question,
    answer: item.answer,
    analysis: item.analysis,
    knowledgePoints: Array.isArray(item.knowledge_points) ? item.knowledge_points : [],
    source: item.source,
    bankQuestionId: item.bank_question_id,
    bankTable: item.bank_table,
    matchedQuestion: item.matched_question,
    historyId: item.id,
    searchStatus: 'success',
  }
}
