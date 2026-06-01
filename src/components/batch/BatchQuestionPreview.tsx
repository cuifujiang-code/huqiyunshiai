import { useMemo, useState } from 'react'
import type { BatchQuestion } from '../../lib/batchApi'
import { useQuestionBasket } from '../../context/QuestionBasketContext'
import MathRenderer from '../common/MathRenderer'

const PLACEHOLDER_KP = new Set(['未分类', '测试', '未知', '无', ''])

function isPlaceholderKnowledge(kp: string) {
  return PLACEHOLDER_KP.has(kp.trim())
}

function sortQuestions(questions: BatchQuestion[]) {
  return [...questions].sort((a, b) => {
    const ao = a.sort_order ?? 0
    const bo = b.sort_order ?? 0
    if (ao !== bo) return ao - bo
    return String(a.id).localeCompare(String(b.id))
  })
}

/** 难度颜色映射 */
const DIFFICULTY_STYLES: Record<string, string> = {
  '基础': 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  '中等': 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  '拔高': 'bg-red-500/15 text-red-300 border-red-500/30',
}

/** 难度系数（模拟组卷网的 0.82 等） */
const DIFFICULTY_COEFF: Record<string, string> = {
  '基础': '0.85',
  '中等': '0.62',
  '拔高': '0.35',
}

/** 题型标签颜色 */
const TYPE_COLORS: Record<string, string> = {
  '选择题': 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  '填空题': 'bg-purple-500/15 text-purple-300 border-purple-500/30',
  '计算题': 'bg-orange-500/15 text-orange-300 border-orange-500/30',
  '证明题': 'bg-pink-500/15 text-pink-300 border-pink-500/30',
  '应用题': 'bg-teal-500/15 text-teal-300 border-teal-500/30',
  '实验题': 'bg-lime-500/15 text-lime-300 border-lime-500/30',
}

const OPTION_LABELS = ['A', 'B', 'C', 'D', 'E', 'F']

function QuestionCard({ question, index }: { question: BatchQuestion; index: number }) {
  const [expanded, setExpanded] = useState(false)
  const { addItem, removeItem, isInBasket } = useQuestionBasket()
  const num = question.sort_order ?? index
  const showKnowledge = question.knowledge_point && !isPlaceholderKnowledge(question.knowledge_point)
  const inBasket = isInBasket(question.id)

  const handleToggleBasket = () => {
    if (inBasket) {
      // 通过 sourceId 移除（兼容新旧 basketId 格式）
      removeItem(question.id)
    } else {
      addItem(question, 'batch')
    }
  }

  // 清理选项标签：如果选项不以 A. B. 等开头，自动添加
  const cleanOptions = question.options.map((opt, oi) => {
    const label = OPTION_LABELS[oi] || String.fromCharCode(65 + oi)
    const trimmed = opt.trim()
    // 检查是否已经有标签前缀
    if (/^[A-F][.、)\s]/.test(trimmed)) return trimmed
    return `${label}. ${trimmed}`
  })

  return (
    <article className="rounded-xl border border-slate-700/60 bg-slate-900/60 p-5 transition-colors hover:border-slate-600/80">
      {/* 题号 + 类型标签 */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 text-xs font-bold text-white shadow-sm">
          {num}
        </span>

        {/* 题型 */}
        {question.question_type && (
          <span className={`rounded-md border px-2 py-0.5 text-xs font-medium ${TYPE_COLORS[question.question_type] || 'bg-slate-800 text-slate-300 border-slate-700'}`}>
            {question.question_type}
          </span>
        )}

        {/* 难度 */}
        {question.difficulty && (
          <span className={`rounded-md border px-2 py-0.5 text-xs ${DIFFICULTY_STYLES[question.difficulty] || 'bg-slate-800 text-slate-400 border-slate-700'}`}>
            {question.difficulty}
            {DIFFICULTY_COEFF[question.difficulty] && (
              <span className="ml-1 opacity-60">({DIFFICULTY_COEFF[question.difficulty]})</span>
            )}
          </span>
        )}

        {/* 知识点 */}
        {showKnowledge && (
          <span className="rounded-md border border-violet-500/20 bg-violet-500/10 px-2 py-0.5 text-xs text-violet-300">
            {question.knowledge_point}
          </span>
        )}

        {/* 学科/年级 */}
        <span className="text-xs text-slate-500">
          {question.subject} · {question.grade}
        </span>
      </div>

      {/* 题目内容（LaTeX 渲染） */}
      <div className="mb-4 text-sm leading-relaxed text-slate-100">
        <MathRenderer text={question.content} className="text-slate-100" />
      </div>

      {/* 选项（组卷网风格：两列网格） */}
      {cleanOptions.length > 0 && (
        <div className="mb-4 grid gap-2 sm:grid-cols-2">
          {cleanOptions.map((opt, oi) => (
            <div
              key={oi}
              className="group flex items-start gap-2 rounded-lg border border-slate-700/50 bg-slate-800/40 px-3 py-2.5 text-sm text-slate-200 transition-all hover:border-cyan-500/40 hover:bg-slate-800/80"
            >
              <span className="mt-px shrink-0 flex h-5 w-5 items-center justify-center rounded border border-slate-600 text-xs font-medium text-slate-400 group-hover:border-cyan-500/50 group-hover:text-cyan-400">
                {OPTION_LABELS[oi]}
              </span>
              <MathRenderer text={opt.replace(/^[A-F][.、)\s]+/, '')} className="text-slate-200" />
            </div>
          ))}
        </div>
      )}

      {/* 图形描述 */}
      {question.geometry_desc && (
        <div className="mb-4 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2">
          <span className="text-xs font-medium text-amber-400">图形描述</span>
          <p className="mt-1 text-xs text-amber-200/80">{question.geometry_desc}</p>
        </div>
      )}

      {/* 答案与解析（可展开） */}
      {(question.answer && question.answer !== '暂无') || (question.analysis && question.analysis !== '暂无') ? (
        <div className="mb-4">
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1.5 text-sm font-medium text-cyan-400 transition-colors hover:text-cyan-300"
          >
            <svg
              className={`h-4 w-4 transition-transform ${expanded ? 'rotate-90' : ''}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
            {expanded ? '收起答案与解析' : '查看答案与解析'}
          </button>
          {expanded && (
            <div className="mt-3 space-y-3 rounded-xl border border-slate-700/60 bg-slate-950/60 p-4">
              {question.answer && question.answer !== '暂无' && (
                <div>
                  <span className="mb-1.5 block text-xs font-semibold text-emerald-400">正确答案</span>
                  <div className="text-sm text-slate-200">
                    <MathRenderer text={question.answer} />
                  </div>
                </div>
              )}
              {question.analysis && question.analysis !== '暂无' && (
                <div>
                  <span className="mb-1.5 block text-xs font-semibold text-slate-400">解析</span>
                  <div className="text-sm leading-relaxed text-slate-300">
                    <MathRenderer text={question.analysis} />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ) : null}

      {/* 底部操作栏（对标组卷网：相似题、纠错、详情、收藏、加入试题篮） */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 pt-3">
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            className="rounded-lg px-2.5 py-1 text-xs text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-300"
            title="查看相似题"
          >
            相似题
          </button>
          <button
            type="button"
            className="rounded-lg px-2.5 py-1 text-xs text-slate-500 transition-colors hover:bg-slate-800 hover:text-amber-400"
            title="纠错"
          >
            纠错
          </button>
          <button
            type="button"
            className="rounded-lg px-2.5 py-1 text-xs text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-300"
            title="收藏"
          >
            收藏
          </button>
          <span className="mx-1 text-slate-700">|</span>
          <span className="text-xs text-slate-600">题目来源：AI拆题</span>
        </div>

        {/* 加入试题篮按钮 */}
        <button
          type="button"
          onClick={handleToggleBasket}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
            inBasket
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 hover:bg-red-500/20 hover:text-red-300 hover:border-red-500/30'
              : 'border border-cyan-500/30 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20'
          }`}
        >
          {inBasket ? (
            <>
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
              移出试题篮
            </>
          ) : (
            <>
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              加入试题篮
            </>
          )}
        </button>
      </div>
    </article>
  )
}

interface BatchQuestionPreviewProps {
  questions: BatchQuestion[]
  title?: string
  onClose: () => void
}

export default function BatchQuestionPreview({ questions, title, onClose }: BatchQuestionPreviewProps) {
  const sorted = useMemo(() => sortQuestions(questions), [questions])
  const heading = title ?? `拆题结果（${sorted.length} 道，已自动入库）`
  const { count } = useQuestionBasket()

  // 按题型分组统计
  const typeStats = useMemo(() => {
    const stats: Record<string, number> = {}
    for (const q of sorted) {
      const t = q.question_type || '其他'
      stats[t] = (stats[t] || 0) + 1
    }
    return stats
  }, [sorted])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
        {/* 头部 */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-700/80 px-6 py-4">
          <div>
            <h3 className="text-lg font-semibold text-white">{heading}</h3>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-400">
                共 <strong className="text-slate-200">{sorted.length}</strong> 题
              </span>
              {Object.entries(typeStats).map(([type, count]) => (
                <span key={type} className="rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-400">
                  {type} ×{count}
                </span>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {count > 0 && (
              <span className="rounded-full bg-cyan-500/20 px-2.5 py-1 text-xs font-medium text-cyan-300">
                试题篮 {count} 题
              </span>
            )}
            <button
              type="button"
              className="rounded-lg px-3 py-1.5 text-sm text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
              onClick={onClose}
            >
              关闭
            </button>
          </div>
        </div>

        {/* 题目列表 */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="space-y-5">
            {sorted.map((q, idx) => (
              <QuestionCard key={q.id || `q-${idx}`} question={q} index={idx + 1} />
            ))}
          </div>
        </div>

        {/* 底部操作栏 */}
        <div className="flex items-center justify-between border-t border-slate-700/80 px-6 py-3">
          <span className="text-xs text-slate-500">
            已自动入库 · 可在题库中搜索使用
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs text-slate-400 transition-colors hover:border-slate-500 hover:text-slate-200"
              onClick={onClose}
            >
              返回列表
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
