import { useMemo, useState } from 'react'
import type { BatchQuestion } from '../../lib/batchApi'
import { questionHasImagePlaceholder } from '../../lib/batchApi'
import type { BankQuestion } from '../../types/teacher'
import { useQuestionBasket } from '../../context/QuestionBasketContext'
import MathRenderer, { analyzeMathContent } from '../MathRenderer'

export type CardQuestion = BatchQuestion | (BankQuestion & { id: string })

const DIFFICULTY_STYLES: Record<string, string> = {
  基础: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  中等: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  拔高: 'bg-red-500/15 text-red-300 border-red-500/30',
}

const TYPE_COLORS: Record<string, string> = {
  选择题: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  填空题: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
  计算题: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
  证明题: 'bg-pink-500/15 text-pink-300 border-pink-500/30',
  应用题: 'bg-teal-500/15 text-teal-300 border-teal-500/30',
  实验题: 'bg-lime-500/15 text-lime-300 border-lime-500/30',
}

const OPTION_LABELS = ['A', 'B', 'C', 'D', 'E', 'F']

function asBatchShape(q: CardQuestion): BatchQuestion {
  const row = q as BatchQuestion & BankQuestion
  return {
    id: String(row.id ?? ''),
    content: row.content ?? '',
    options: row.options ?? [],
    answer: row.answer ?? '暂无',
    analysis: row.analysis ?? '暂无',
    geometry_desc: row.geometry_desc ?? '',
    latex_blocks: row.latex_blocks ?? [],
    question_type: row.question_type ?? '应用题',
    difficulty: row.difficulty ?? '中等',
    knowledge_point: row.knowledge_point ?? '',
    subject: row.subject ?? '数学',
    grade: row.grade ?? '八年级',
    sort_order: row.sort_order,
    question_number: row.question_number,
    tags: row.tags ?? [],
    has_image_placeholder: row.has_image_placeholder,
  }
}

export interface BatchQuestionCardProps {
  question: CardQuestion
  index?: number
  onEdit?: () => void
  draggable?: boolean
  onDragStart?: (questionId: string) => void
  onDragEnd?: () => void
}

export default function BatchQuestionCard({
  question,
  index = 1,
  onEdit,
  draggable = false,
  onDragStart,
  onDragEnd,
}: BatchQuestionCardProps) {
  const [expanded, setExpanded] = useState(false)
  const { addItem, removeItem, isInBasket } = useQuestionBasket()
  const q = asBatchShape(question)
  const num = q.sort_order ?? index
  const inBasket = isInBasket(q.id)
  const hasImagePlaceholder = questionHasImagePlaceholder(q)
  const latexBlocks = q.latex_blocks
  const mathStats = useMemo(
    () => analyzeMathContent(q.content, latexBlocks),
    [q.content, latexBlocks],
  )

  const cleanOptions = (q.options ?? []).map((opt, oi) => {
    const label = OPTION_LABELS[oi] || String.fromCharCode(65 + oi)
    const trimmed = opt.trim()
    if (/^[A-F][.、)\s]/.test(trimmed)) return trimmed
    return `${label}. ${trimmed}`
  })

  const handleToggleBasket = () => {
    if (inBasket) removeItem(q.id)
    else addItem(q, 'bank')
  }

  return (
    <article
      draggable={draggable}
      onDragStart={() => onDragStart?.(q.id)}
      onDragEnd={onDragEnd}
      className={`rounded-xl border bg-slate-900/60 p-5 transition-colors ${
        draggable ? 'cursor-grab border-slate-600/80 hover:border-cyan-500/40 active:cursor-grabbing' : 'border-slate-700/60 hover:border-slate-600/80'
      }`}
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 text-xs font-bold text-white">
          {num}
        </span>
        {q.question_type && (
          <span className={`rounded-md border px-2 py-0.5 text-xs font-medium ${TYPE_COLORS[q.question_type] || 'border-slate-700 bg-slate-800 text-slate-300'}`}>
            {q.question_type}
          </span>
        )}
        {q.difficulty && (
          <span className={`rounded-md border px-2 py-0.5 text-xs ${DIFFICULTY_STYLES[q.difficulty] || 'border-slate-700 bg-slate-800 text-slate-400'}`}>
            {q.difficulty}
          </span>
        )}
        {q.knowledge_point && (
          <span className="rounded-md border border-violet-500/20 bg-violet-500/10 px-2 py-0.5 text-xs text-violet-300">
            {q.knowledge_point}
          </span>
        )}
        {mathStats.renderedFormulas > 0 && (
          <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-300">
            公式 ×{mathStats.renderedFormulas}
          </span>
        )}
        <span className="text-xs text-slate-500">{q.subject} · {q.grade}</span>
      </div>

      {hasImagePlaceholder && (
        <div className="mb-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200/90">
          含图片占位符，请手动补图
        </div>
      )}

      <div className="mb-4 text-sm leading-relaxed text-slate-100">
        <MathRenderer text={q.content} latexBlocks={latexBlocks} className="text-slate-100" />
      </div>

      {cleanOptions.length > 0 && (
        <div className="mb-4 grid gap-2 sm:grid-cols-2">
          {cleanOptions.map((opt, oi) => (
            <div key={oi} className="rounded-lg border border-slate-700/50 bg-slate-800/40 px-3 py-2 text-sm text-slate-200">
              <MathRenderer text={opt.replace(/^[A-F][.、)\s]+/, '')} latexBlocks={latexBlocks} />
            </div>
          ))}
        </div>
      )}

      {(q.answer && q.answer !== '暂无') || (q.analysis && q.analysis !== '暂无') ? (
        <div className="mb-4">
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="text-sm font-medium text-cyan-400 hover:text-cyan-300"
          >
            {expanded ? '收起答案与解析' : '查看答案与解析'}
          </button>
          {expanded && (
            <div className="mt-3 space-y-2 rounded-xl border border-slate-700/60 bg-slate-950/60 p-4 text-sm">
              {q.answer && q.answer !== '暂无' && (
                <div>
                  <span className="text-xs font-semibold text-emerald-400">答案</span>
                  <MathRenderer text={q.answer} latexBlocks={latexBlocks} />
                </div>
              )}
              {q.analysis && q.analysis !== '暂无' && (
                <div>
                  <span className="text-xs font-semibold text-slate-400">解析</span>
                  <MathRenderer text={q.analysis} latexBlocks={latexBlocks} />
                </div>
              )}
            </div>
          )}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-800 pt-3">
        {onEdit && (
          <button type="button" className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800" onClick={onEdit}>
            编辑
          </button>
        )}
        {draggable && (
          <span className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-500" title="拖拽到左侧目录">
            ⋮⋮ 拖拽移动
          </span>
        )}
        <button
          type="button"
          onClick={handleToggleBasket}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
            inBasket
              ? 'border border-cyan-500/30 bg-cyan-500/20 text-cyan-300'
              : 'border border-cyan-500/30 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20'
          }`}
        >
          {inBasket ? '移出篮子' : '加入篮子'}
        </button>
      </div>
    </article>
  )
}
