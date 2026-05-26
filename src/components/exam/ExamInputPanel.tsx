import type { Difficulty, Grade, Subject } from '../../types/exam'
import { DIFFICULTIES, GRADES, SUBJECTS } from '../../types/exam'

interface ExamInputPanelProps {
  prompt: string
  subject: Subject
  grade: Grade
  difficulty: Difficulty
  loading: boolean
  onPromptChange: (value: string) => void
  onSubjectChange: (value: Subject) => void
  onGradeChange: (value: Grade) => void
  onDifficultyChange: (value: Difficulty) => void
  onGenerate: () => void
}

const inputClass =
  'w-full rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-3 text-white outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30'

export default function ExamInputPanel({
  prompt,
  subject,
  grade,
  difficulty,
  loading,
  onPromptChange,
  onSubjectChange,
  onGradeChange,
  onDifficultyChange,
  onGenerate,
}: ExamInputPanelProps) {
  return (
    <div className="flex h-full flex-col rounded-2xl border border-blue-500/20 bg-slate-900/60 p-5 shadow-xl shadow-blue-900/10 sm:p-6">
      <h2 className="text-xl font-bold text-blue-100 sm:text-2xl">AI智能出题</h2>
      <p className="mt-2 text-sm text-slate-400">描述您的出题需求，AI 将为您生成完整试卷</p>
      <div className="mt-5 flex flex-1 flex-col gap-4">
        <div className="flex-1">
          <label htmlFor="exam-prompt" className="mb-1.5 block text-sm font-medium text-slate-300">出题需求</label>
          <textarea id="exam-prompt" value={prompt} onChange={(e) => onPromptChange(e.target.value)} placeholder="请描述您的出题需求，例如：八年级物理压强单元测试卷，选择题10道、填空题6道、计算题2道，整体难度中等偏上。" rows={8} className={`${inputClass} min-h-[160px] resize-y placeholder-slate-500`} />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label htmlFor="subject" className="mb-1.5 block text-sm font-medium text-slate-300">学科</label>
            <select id="subject" value={subject} onChange={(e) => onSubjectChange(e.target.value as Subject)} className={inputClass}>
              {SUBJECTS.map((s) => (<option key={s} value={s}>{s}</option>))}
            </select>
          </div>
          <div>
            <label htmlFor="grade" className="mb-1.5 block text-sm font-medium text-slate-300">年级</label>
            <select id="grade" value={grade} onChange={(e) => onGradeChange(e.target.value as Grade)} className={inputClass}>
              {GRADES.map((g) => (<option key={g} value={g}>{g}</option>))}
            </select>
          </div>
          <div>
            <label htmlFor="difficulty" className="mb-1.5 block text-sm font-medium text-slate-300">试卷难度</label>
            <select id="difficulty" value={difficulty} onChange={(e) => onDifficultyChange(e.target.value as Difficulty)} className={inputClass}>
              {DIFFICULTIES.map((d) => (<option key={d} value={d}>{d}</option>))}
            </select>
          </div>
        </div>
        <button type="button" onClick={onGenerate} disabled={loading || !prompt.trim()} className="mt-auto w-full rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 py-3.5 text-sm font-semibold text-white shadow-lg shadow-blue-600/30 transition hover:from-blue-500 hover:to-cyan-400 disabled:cursor-not-allowed disabled:opacity-60">
          {loading ? (
            <span className="inline-flex items-center justify-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              正在生成中...
            </span>
          ) : (
            '开始生成试卷'
          )}
        </button>
      </div>
    </div>
  )
}
