import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuestionBasket } from '../../context/QuestionBasketContext'

const TYPE_LABELS: Record<string, string> = {
  '选择题': '选',
  '填空题': '填',
  '计算题': '算',
  '证明题': '证',
  '应用题': '应',
}

const DIFFICULTY_COLORS: Record<string, string> = {
  '基础': 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  '中等': 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  '拔高': 'bg-red-500/20 text-red-300 border-red-500/30',
}

export default function QuestionBasket() {
  const { items, count, removeItem, clearBasket, groupedByType } = useQuestionBasket()
  const [expanded, setExpanded] = useState(false)
  const navigate = useNavigate()

  if (count === 0) return null

  const typeEntries = Object.entries(groupedByType)

  return (
    <>
      {/* 悬浮按钮 */}
      <div className="fixed bottom-6 right-6 z-50">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 rounded-full bg-gradient-to-r from-cyan-500 to-blue-600 px-5 py-3 text-white shadow-lg shadow-cyan-500/30 transition-all hover:shadow-xl hover:shadow-cyan-500/40 hover:scale-105"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
          </svg>
          <span className="font-semibold">试题篮</span>
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-sm font-bold text-cyan-600">
            {count}
          </span>
        </button>
      </div>

      {/* 展开面板 */}
      {expanded && (
        <div className="fixed bottom-24 right-6 z-50 w-96 max-h-[60vh] overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
          {/* 头部 */}
          <div className="flex items-center justify-between border-b border-slate-700 px-4 py-3">
            <h3 className="font-semibold text-white">
              试题篮（{count} 题）
            </h3>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={clearBasket}
                className="rounded-lg px-2 py-1 text-xs text-slate-400 hover:bg-slate-800 hover:text-red-400 transition-colors"
              >
                清空
              </button>
              <button
                type="button"
                onClick={() => setExpanded(false)}
                className="rounded-lg px-2 py-1 text-xs text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
              >
                收起
              </button>
            </div>
          </div>

          {/* 题型分组 */}
          <div className="max-h-[40vh] overflow-y-auto p-3">
            {typeEntries.map(([type, questions]) => (
              <div key={type} className="mb-3">
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-xs font-medium text-cyan-400">{type}</span>
                  <span className="text-xs text-slate-500">×{questions.length}</span>
                </div>
                <div className="space-y-2">
                  {questions.map((q) => (
                    <div
                      key={q.basketId}
                      className="group flex items-start gap-2 rounded-lg border border-slate-700/50 bg-slate-800/40 p-2 transition-colors hover:border-slate-600"
                    >
                      {/* 类型徽章 */}
                      <span className="mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold bg-slate-700 text-slate-300">
                        {TYPE_LABELS[q.question_type] || '题'}
                      </span>
                      {/* 内容摘要 */}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs text-slate-200">
                          {q.content.replace(/\$\$[\s\S]*?\$\$/g, '[公式]').replace(/\$[^$]+\$/g, '[公式]').slice(0, 60)}
                        </p>
                        <div className="mt-1 flex items-center gap-2">
                          {q.difficulty && (
                            <span className={`rounded border px-1.5 py-0.5 text-[10px] ${DIFFICULTY_COLORS[q.difficulty] || 'bg-slate-700 text-slate-400 border-slate-600'}`}>
                              {q.difficulty}
                            </span>
                          )}
                          {q.knowledge_point && q.knowledge_point !== '未分类' && (
                            <span className="truncate text-[10px] text-slate-500">{q.knowledge_point}</span>
                          )}
                        </div>
                      </div>
                      {/* 删除按钮 */}
                      <button
                        type="button"
                        onClick={() => removeItem(q.basketId)}
                        className="shrink-0 rounded p-1 text-slate-600 opacity-0 transition-all hover:bg-red-500/20 hover:text-red-400 group-hover:opacity-100"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* 底部操作 */}
          <div className="border-t border-slate-700 px-4 py-3">
            <button
              type="button"
              onClick={() => {
                navigate('/teacher/exam-builder')
                setExpanded(false)
              }}
              className="w-full rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 py-2.5 text-sm font-semibold text-white shadow-lg shadow-cyan-500/20 transition-all hover:shadow-xl hover:shadow-cyan-500/30"
            >
              去组卷（{count} 题）
            </button>
          </div>
        </div>
      )}
    </>
  )
}
