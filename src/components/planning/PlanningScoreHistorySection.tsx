import { useMemo } from 'react'
import type { EnhancedPlanningFormData, ExamScoreRecord, SubjectScore } from '../../types/planning'
import { EXAM_SESSION_OPTIONS, ACADEMIC_TERMS } from '../../data/provinceExamProfiles'
import { analyzeScoreHistory, emptyScoreRecord } from '../../lib/scoreAnalysis'

const labelClass = 'mb-1.5 block text-sm font-medium text-[#B0B9C8]'
const inputClass =
  'w-full rounded-xl border border-[#2A3444] bg-[#151C28] px-3 py-2 text-sm text-[#E8ECF3] outline-none focus:border-[#2584FF]'
const sectionTitleClass = 'flex items-center gap-2 text-sm font-semibold text-[#E8ECF3]'
const sectionDescClass = 'text-xs text-[#6B7588]'

interface Props {
  form: EnhancedPlanningFormData
  onChange: (form: EnhancedPlanningFormData) => void
}

export default function PlanningScoreHistorySection({ form, onChange }: Props) {
  const analysis = useMemo(
    () => analyzeScoreHistory(form.scoreHistory, form.electiveSubjects),
    [form.scoreHistory, form.electiveSubjects],
  )

  const addRecord = () => {
    const rec = emptyScoreRecord()
    rec.subjectScores = form.subjectScores.map((s) => ({ ...s }))
    rec.schoolRank = form.ranking.schoolRank
    rec.classRank = form.ranking.classRank
    onChange({
      ...form,
      scoreHistory: [...form.scoreHistory, rec],
      scoreAnalysis: analyzeScoreHistory([...form.scoreHistory, rec], form.electiveSubjects),
    })
  }

  const updateRecord = (id: string, patch: Partial<ExamScoreRecord>) => {
    const next = form.scoreHistory.map((r) => (r.id === id ? { ...r, ...patch } : r))
    onChange({ ...form, scoreHistory: next, scoreAnalysis: analyzeScoreHistory(next, form.electiveSubjects) })
  }

  const updateRecordSubject = (recordId: string, subject: string, patch: Partial<SubjectScore>) => {
    const next = form.scoreHistory.map((r) => {
      if (r.id !== recordId) return r
      const subjects = r.subjectScores.some((s) => s.subject === subject)
        ? r.subjectScores.map((s) => (s.subject === subject ? { ...s, ...patch } : s))
        : [...r.subjectScores, { subject, score: null, fullScore: 100, classRank: null, schoolRank: null, scoreTrend: 'stable' as const, ...patch }]
      return { ...r, subjectScores: subjects }
    })
    onChange({ ...form, scoreHistory: next, scoreAnalysis: analyzeScoreHistory(next, form.electiveSubjects) })
  }

  const removeRecord = (id: string) => {
    const next = form.scoreHistory.filter((r) => r.id !== id)
    onChange({ ...form, scoreHistory: next, scoreAnalysis: analyzeScoreHistory(next, form.electiveSubjects) })
  }

  return (
    <div className="rounded-xl border border-white/[0.04] bg-[#161D2B]/60 p-4">
      <div className="mb-3 flex items-center justify-between border-b border-white/[0.05] pb-2.5">
        <div>
          <div className={sectionTitleClass}>
            <span>📈</span>
            <span>历次成绩与波动分析</span>
          </div>
          <p className={sectionDescClass}>录入多次考试后，系统将量化分析波动，供 AI 协同规划使用</p>
        </div>
        <button
          type="button"
          onClick={addRecord}
          className="shrink-0 rounded-lg bg-[#2584FF]/20 px-3 py-1.5 text-xs text-[#93C5FD] hover:bg-[#2584FF]/30"
        >
          + 添加考试
        </button>
      </div>

      {form.scoreHistory.length === 0 ? (
        <p className="py-4 text-center text-xs text-[#6B7588]">
          建议至少添加 2 次考试（如上下学期期末、一模等）
        </p>
      ) : (
        <div className="mb-4 space-y-3">
          {form.scoreHistory.map((rec) => (
            <div key={rec.id} className="rounded-xl border border-white/[0.06] bg-[#151C28] p-3">
              <div className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
                <input
                  className={inputClass}
                  placeholder="考试名称"
                  value={rec.examName}
                  onChange={(e) => updateRecord(rec.id, { examName: e.target.value })}
                />
                <input
                  type="date"
                  className={inputClass}
                  value={rec.examDate}
                  onChange={(e) => updateRecord(rec.id, { examDate: e.target.value })}
                />
                <select
                  className={inputClass}
                  value={rec.term}
                  onChange={(e) => updateRecord(rec.id, { term: e.target.value as ExamScoreRecord['term'] })}
                >
                  {ACADEMIC_TERMS.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <select
                  className={inputClass}
                  value={rec.examType}
                  onChange={(e) => updateRecord(rec.id, { examType: e.target.value })}
                >
                  {EXAM_SESSION_OPTIONS.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => removeRecord(rec.id)}
                  className="rounded-lg border border-red-500/30 px-2 py-1 text-xs text-red-400"
                >
                  删除
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {form.subjectScores.map((subj) => {
                  const hit = rec.subjectScores.find((s) => s.subject === subj.subject)
                  return (
                    <label key={subj.subject} className="flex items-center gap-1 text-xs text-[#8A94A9]">
                      {subj.subject}
                      <input
                        type="number"
                        className="w-14 rounded border border-[#2A3444] bg-transparent px-1 py-0.5 text-center text-[#E8ECF3]"
                        value={hit?.score ?? ''}
                        onChange={(e) =>
                          updateRecordSubject(rec.id, subj.subject, {
                            score: e.target.value ? Number(e.target.value) : null,
                            fullScore: subj.fullScore,
                          })
                        }
                      />
                    </label>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {analysis.recordCount > 0 && (
        <div className="rounded-xl border border-blue-500/20 bg-blue-500/[0.06] p-3">
          <p className="mb-2 text-xs font-medium text-blue-300">量化分析预览</p>
          <p className="mb-2 text-xs leading-relaxed text-[#B0B9C8]">{analysis.summary}</p>
          {analysis.subjectInsights.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="text-left text-[#6B7588]">
                    <th className="py-1 pr-2">科目</th>
                    <th className="py-1 pr-2">最近</th>
                    <th className="py-1 pr-2">变化</th>
                    <th className="py-1 pr-2">波动</th>
                    <th className="py-1">趋势</th>
                  </tr>
                </thead>
                <tbody>
                  {analysis.subjectInsights.map((s) => (
                    <tr key={s.subject} className="border-t border-white/[0.04]">
                      <td className="py-1 pr-2 text-[#E8ECF3]">
                        {s.subject}
                        {s.isElective && <span className="ml-1 text-[#2584FF]">选</span>}
                      </td>
                      <td className="py-1 pr-2">{s.latestScore}</td>
                      <td className={`py-1 pr-2 ${s.delta >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {s.delta >= 0 ? '+' : ''}{s.delta}
                      </td>
                      <td className="py-1 pr-2 text-[#8A94A9]">σ≈{s.volatility}</td>
                      <td className="py-1">
                        {s.trend === 'up' ? '↑' : s.trend === 'down' ? '↓' : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
