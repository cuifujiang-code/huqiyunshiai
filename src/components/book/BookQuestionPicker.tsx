import { useCallback, useEffect, useState } from 'react'
import { fetchQuestions } from '../../lib/teacherApi'
import type { BankQuestion } from '../../types/teacher'
import { btnSecondary, inputClass } from '../../types/teacher'

interface Props {
  teacherId: string
  selected: BankQuestion[]
  onChange: (questions: BankQuestion[]) => void
}

export default function BookQuestionPicker({ teacherId, selected, onChange }: Props) {
  const [list, setList] = useState<BankQuestion[]>([])
  const [loading, setLoading] = useState(false)
  const [keyword, setKeyword] = useState('')
  const selectedIds = new Set(selected.map((q) => q.id).filter(Boolean))

  const load = useCallback(async () => {
    if (!teacherId) return
    setLoading(true)
    try {
      const data = await fetchQuestions(teacherId, { page: 1, pageSize: 50, keyword })
      setList(data.items)
    } catch {
      setList([])
    } finally {
      setLoading(false)
    }
  }, [teacherId, keyword])

  useEffect(() => {
    void load()
  }, [load])

  const toggle = (q: BankQuestion) => {
    if (!q.id) return
    if (selectedIds.has(q.id)) {
      onChange(selected.filter((x) => x.id !== q.id))
    } else {
      onChange([...selected, q])
    }
  }

  const selectAll = () => onChange([...list.filter((q) => q.id)])

  const clearAll = () => onChange([])

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-3">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-slate-200">从题库选题</h4>
        <span className="text-xs text-cyan-400">已选 {selected.length} 题</span>
      </div>
      <div className="mb-2 flex gap-2">
        <input
          className={`${inputClass} flex-1 py-2 text-sm`}
          placeholder="搜索题目"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && load()}
        />
        <button type="button" className={btnSecondary} onClick={() => void load()}>
          搜
        </button>
      </div>
      <div className="mb-2 flex gap-2">
        <button type="button" className="text-xs text-cyan-400" onClick={selectAll}>
          全选本页
        </button>
        <button type="button" className="text-xs text-slate-500" onClick={clearAll}>
          清空
        </button>
      </div>
      <div className="max-h-48 space-y-1 overflow-y-auto">
        {loading ? (
          <p className="py-4 text-center text-xs text-slate-500">加载中…</p>
        ) : list.length === 0 ? (
          <p className="py-4 text-center text-xs text-slate-500">暂无题目</p>
        ) : (
          list.map((q) => (
            <label
              key={q.id}
              className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-700/50"
            >
              <input
                type="checkbox"
                className="mt-1 accent-cyan-500"
                checked={!!q.id && selectedIds.has(q.id)}
                onChange={() => toggle(q)}
              />
              <span className="min-w-0 flex-1 text-xs text-slate-300">
                <span className="text-slate-500">{q.question_type} · </span>
                {(q.content || '').slice(0, 60)}
                {(q.content?.length ?? 0) > 60 ? '…' : ''}
                {q.knowledge_point && (
                  <span className="ml-1 text-violet-400">[{q.knowledge_point}]</span>
                )}
              </span>
            </label>
          ))
        )}
      </div>
    </div>
  )
}
