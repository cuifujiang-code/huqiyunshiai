import { useState } from 'react'
import MathRenderer from './common/MathRenderer'
import type { BankQuestion } from '../types/teacher'
import { btnPrimary, btnSecondary } from '../types/teacher'
import {
  createQuestion,
  fetchAiSimilarQuestions,
  generateAiVariantQuestion,
  generateAiWrongAnswerExplanation,
} from '../lib/teacherApi'

interface Props {
  teacherId: string
  question: BankQuestion
  onSavedVariant?: () => void
}

export default function QuestionAiPanel({ teacherId, question, onSavedVariant }: Props) {
  const [loading, setLoading] = useState<'variant' | 'similar' | 'explanation' | 'save' | null>(null)
  const [variant, setVariant] = useState<Partial<BankQuestion> | null>(null)
  const [similar, setSimilar] = useState<BankQuestion[]>([])
  const [explanation, setExplanation] = useState('')
  const [message, setMessage] = useState<string | null>(null)

  if (!question.id) return null

  const handleVariant = async () => {
    setLoading('variant')
    setMessage(null)
    try {
      const v = await generateAiVariantQuestion(teacherId, question.id!)
      setVariant(v)
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '生成失败')
    } finally {
      setLoading(null)
    }
  }

  const handleSaveVariant = async () => {
    if (!variant) return
    setLoading('save')
    setMessage(null)
    try {
      await createQuestion(teacherId, variant)
      setMessage('变式题已保存到题库')
      onSavedVariant?.()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '保存失败')
    } finally {
      setLoading(null)
    }
  }

  const handleSimilar = async () => {
    setLoading('similar')
    setMessage(null)
    try {
      const items = await fetchAiSimilarQuestions(teacherId, question.id!)
      setSimilar(items)
      if (!items.length) setMessage('未找到相近题目，可尝试补充知识点标注')
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '推荐失败')
    } finally {
      setLoading(null)
    }
  }

  const handleExplanation = async () => {
    setLoading('explanation')
    setMessage(null)
    try {
      const text = await generateAiWrongAnswerExplanation(teacherId, question.id!)
      setExplanation(text)
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '生成失败')
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="rounded-[10px] border border-violet-500/20 bg-violet-500/5 p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-medium text-violet-300">AI 辅助</span>
        <button
          type="button"
          className={btnSecondary}
          style={{ fontSize: 12, padding: '4px 10px' }}
          disabled={!!loading}
          onClick={handleVariant}
        >
          {loading === 'variant' ? '生成中…' : 'AI生成变式题'}
        </button>
        <button
          type="button"
          className={btnSecondary}
          style={{ fontSize: 12, padding: '4px 10px' }}
          disabled={!!loading}
          onClick={handleSimilar}
        >
          {loading === 'similar' ? '检索中…' : 'AI同类题推荐'}
        </button>
        <button
          type="button"
          className={btnSecondary}
          style={{ fontSize: 12, padding: '4px 10px' }}
          disabled={!!loading}
          onClick={handleExplanation}
        >
          {loading === 'explanation' ? '生成中…' : 'AI错题讲解'}
        </button>
      </div>

      {message && <p className="text-xs text-amber-300">{message}</p>}

      {variant && (
        <div className="rounded-[8px] border border-white/[0.08] bg-[#1C2332] p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-[#5C9DFF]">变式题预览</span>
            <button
              type="button"
              className={btnPrimary}
              style={{ fontSize: 11, padding: '4px 10px' }}
              disabled={loading === 'save'}
              onClick={handleSaveVariant}
            >
              {loading === 'save' ? '保存中…' : '一键保存到题库'}
            </button>
          </div>
          <MathRenderer text={variant.content ?? ''} className="text-sm" />
          {variant.options && variant.options.length > 0 && (
            <div className="grid grid-cols-2 gap-1 text-xs">
              {variant.options.map((opt, i) => (
                <div key={i} className="rounded bg-white/[0.03] px-2 py-1">
                  <MathRenderer text={opt} />
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-emerald-400">答案：<MathRenderer text={variant.answer ?? ''} className="inline" /></p>
        </div>
      )}

      {similar.length > 0 && (
        <div className="space-y-2">
          <span className="text-xs font-medium text-[#8A94A9]">同类题推荐（{similar.length}）</span>
          {similar.map((q) => (
            <div key={q.id} className="rounded-[8px] border border-white/[0.06] bg-[#1C2332] px-3 py-2 text-xs">
              <div className="mb-1 flex gap-2 text-[#6B7394]">
                <span>{q.question_type}</span>
                <span>{q.difficulty}</span>
                {q.knowledge_point && <span className="truncate">{q.knowledge_point}</span>}
              </div>
              <MathRenderer text={(q.content ?? '').slice(0, 200)} className="text-[#C8CFDF]" />
            </div>
          ))}
        </div>
      )}

      {explanation && (
        <div className="rounded-[8px] border border-white/[0.08] bg-[#1C2332] p-3">
          <span className="mb-2 block text-xs font-medium text-[#5C9DFF]">错题讲解</span>
          <MathRenderer text={explanation} className="text-sm leading-relaxed text-[#C8CFDF]" />
        </div>
      )}
    </div>
  )
}
