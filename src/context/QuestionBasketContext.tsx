import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { BatchQuestion } from '../lib/batchApi'
import type { BankQuestion } from '../types/teacher'

/** 试题篮中的题目（兼容批量拆题和题库两种数据源） */
export interface BasketQuestion {
  /** 唯一标识 */
  basketId: string
  /** 题目内容 */
  content: string
  /** 选项列表 */
  options: string[]
  /** 答案 */
  answer: string
  /** 解析 */
  analysis: string
  /** 题目类型 */
  question_type: string
  /** 难度 */
  difficulty: string
  /** 知识点 */
  knowledge_point: string
  /** 学科 */
  subject: string
  /** 年级 */
  grade: string
  /** 原始数据源 */
  sourceId?: string
  /** 来源类型 */
  sourceType: 'batch' | 'bank'
  /** 加入时间 */
  addedAt: string
}

interface QuestionBasketContextValue {
  /** 试题篮中的题目列表 */
  items: BasketQuestion[]
  /** 题目数量 */
  count: number
  /** 加入试题篮 */
  addItem: (q: BatchQuestion | BankQuestion, sourceType: 'batch' | 'bank') => void
  /** 移出试题篮 */
  removeItem: (basketId: string) => void
  /** 检查题目是否在篮中 */
  isInBasket: (sourceId: string) => boolean
  /** 清空试题篮 */
  clearBasket: () => void
  /** 按类型分组 */
  groupedByType: Record<string, BasketQuestion[]>
}

const STORAGE_KEY = 'huqiyunshiai_question_basket'

const QuestionBasketContext = createContext<QuestionBasketContextValue | null>(null)

function loadFromStorage(): BasketQuestion[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
  } catch {
    return []
  }
}

function saveToStorage(items: BasketQuestion[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  } catch {
    // storage full, ignore
  }
}

function batchToBasket(q: BatchQuestion, sourceType: 'batch' | 'bank'): BasketQuestion {
  return {
    basketId: `${sourceType}-${q.id}-${Date.now()}`,
    content: q.content,
    options: q.options ?? [],
    answer: q.answer,
    analysis: q.analysis,
    question_type: q.question_type,
    difficulty: q.difficulty,
    knowledge_point: q.knowledge_point,
    subject: q.subject,
    grade: q.grade,
    sourceId: q.id,
    sourceType,
    addedAt: new Date().toISOString(),
  }
}

function bankToBasket(q: BankQuestion, sourceType: 'batch' | 'bank'): BasketQuestion {
  return {
    basketId: `${sourceType}-${q.id ?? Date.now()}-${Date.now()}`,
    content: q.content,
    options: q.options ?? [],
    answer: q.answer,
    analysis: q.analysis,
    question_type: q.question_type,
    difficulty: q.difficulty,
    knowledge_point: q.knowledge_point,
    subject: q.subject,
    grade: q.grade,
    sourceId: q.id,
    sourceType,
    addedAt: new Date().toISOString(),
  }
}

export function QuestionBasketProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<BasketQuestion[]>(() => loadFromStorage())

  useEffect(() => {
    saveToStorage(items)
  }, [items])

  const addItem = useCallback((q: BatchQuestion | BankQuestion, sourceType: 'batch' | 'bank') => {
    setItems((prev) => {
      // 去重：同一 sourceId 不重复添加
      const sourceId = q.id
      if (sourceId && prev.some((item) => item.sourceId === sourceId)) {
        return prev
      }
      const basketItem = sourceType === 'batch'
        ? batchToBasket(q as BatchQuestion, sourceType)
        : bankToBasket(q as BankQuestion, sourceType)
      return [...prev, basketItem]
    })
  }, [])

  const removeItem = useCallback((basketIdOrSourceId: string) => {
    setItems((prev) => {
      // 先尝试精确匹配 basketId
      const byBasketId = prev.filter((item) => item.basketId !== basketIdOrSourceId)
      if (byBasketId.length < prev.length) return byBasketId
      // 再尝试通过 sourceId 匹配
      return prev.filter((item) => item.sourceId !== basketIdOrSourceId)
    })
  }, [])

  const isInBasket = useCallback((sourceId: string) => {
    return items.some((item) => item.sourceId === sourceId)
  }, [items])

  const clearBasket = useCallback(() => {
    setItems([])
  }, [])

  const groupedByType = useMemo(() => {
    const groups: Record<string, BasketQuestion[]> = {}
    for (const item of items) {
      const type = item.question_type || '其他'
      if (!groups[type]) groups[type] = []
      groups[type].push(item)
    }
    return groups
  }, [items])

  const value = useMemo(() => ({
    items,
    count: items.length,
    addItem,
    removeItem,
    isInBasket,
    clearBasket,
    groupedByType,
  }), [items, addItem, removeItem, isInBasket, clearBasket, groupedByType])

  return (
    <QuestionBasketContext.Provider value={value}>
      {children}
    </QuestionBasketContext.Provider>
  )
}

export function useQuestionBasket() {
  const ctx = useContext(QuestionBasketContext)
  if (!ctx) {
    throw new Error('useQuestionBasket must be used within QuestionBasketProvider')
  }
  return ctx
}
