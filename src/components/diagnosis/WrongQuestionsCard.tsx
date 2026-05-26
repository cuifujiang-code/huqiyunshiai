import type { WrongQuestionAnalysis } from '../../types/diagnosis'

export default function WrongQuestionsCard({ questions }: { questions: WrongQuestionAnalysis[] }) {
  return (
    <div className="rounded-2xl border border-blue-500/20 bg-slate-900/60 p-5 sm:p-6">
      <h3 className="mb-4 text-base font-semibold text-blue-200">典型错题精析</h3>
      <div className="space-y-5">
        {questions.map((q, i) => (
          <div key={q.id} className="rounded-xl border border-slate-700 bg-slate-800/40 p-4">
            <p className="text-sm font-medium text-blue-200">错题 {i + 1}</p>
            <p className="mt-2 text-sm text-slate-300">{q.content}</p>
            <p className="mt-2 text-xs text-red-300"><span className="font-medium">你的答案：</span>{q.studentAnswer}</p>
            <p className="mt-1 text-xs text-emerald-300"><span className="font-medium">正确解法：</span>{q.correctAnswer}</p>
            <p className="mt-2 text-xs text-slate-400"><span className="font-medium text-slate-300">思维卡点：</span>{q.thinkingBlock}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
