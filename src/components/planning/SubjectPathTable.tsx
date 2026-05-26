import type { SubjectPath } from '../../types/planning'

interface Props {
  subjectPaths: SubjectPath[]
}

function StarRating({ count }: { count: number }) {
  const stars = Math.min(5, Math.max(1, Math.round(count)))
  return (
    <span className="text-amber-400" aria-label={`${stars}星`}>
      {'★'.repeat(stars)}
      <span className="text-slate-600">{'★'.repeat(5 - stars)}</span>
    </span>
  )
}

export default function SubjectPathTable({ subjectPaths }: Props) {
  return (
    <section className="rounded-2xl border border-blue-500/20 bg-slate-900/60 p-5 sm:p-6">
      <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-blue-100">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500/20 text-sm">3</span>
        学科路径规划
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-700 text-xs text-slate-400">
              <th className="pb-3 pr-4 font-medium">学科</th>
              <th className="pb-3 pr-4 font-medium">重要性</th>
              <th className="pb-3 pr-4 font-medium">时间占比</th>
              <th className="pb-3 pr-4 font-medium">关键知识点</th>
              <th className="pb-3 font-medium">推荐资源</th>
            </tr>
          </thead>
          <tbody>
            {subjectPaths.map((row) => (
              <tr key={row.subject} className="border-b border-slate-800/80 last:border-0">
                <td className="py-3 pr-4 font-medium text-blue-100">{row.subject}</td>
                <td className="py-3 pr-4">
                  <StarRating count={row.importance} />
                </td>
                <td className="py-3 pr-4 text-slate-300">{row.timePercent}%</td>
                <td className="py-3 pr-4 text-slate-400">{row.keyKnowledgePoints.join('、')}</td>
                <td className="py-3 text-slate-400">{row.resourceTypes.join('、')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
