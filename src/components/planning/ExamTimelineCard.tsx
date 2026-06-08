import type { PlanningReport } from '../../types/planning'

export default function ExamTimelineCard({ report }: { report: PlanningReport }) {
  const timeline = report.examTimeline
  const volunteer = report.volunteerGuidance
  const elective = report.electiveAdvice

  if (!timeline?.length && !volunteer?.length && !elective?.length) return null

  return (
    <div className="space-y-4 rounded-xl border border-purple-500/20 bg-purple-500/[0.05] p-4">
      {report.studentProfile.examSystemNote && (
        <p className="text-xs text-purple-200/90">
          <strong>考试制度：</strong>{report.studentProfile.examSystemNote}
        </p>
      )}
      {report.studentProfile.electiveSubjects && report.studentProfile.electiveSubjects.length > 0 && (
        <p className="text-xs text-slate-400">
          选考科目：{report.studentProfile.electiveSubjects.join('、')}
        </p>
      )}
      {timeline && timeline.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-purple-200">升学时间轴</h3>
          <div className="space-y-1.5">
            {timeline.map((t, i) => (
              <div key={i} className="flex gap-2 text-xs">
                <span className="shrink-0 font-medium text-purple-300">{t.month}</span>
                <span className="text-slate-300">
                  {t.event}
                  {t.note ? <span className="text-slate-500"> — {t.note}</span> : null}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      {elective && elective.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-purple-200">选考科目建议</h3>
          {elective.map((e, i) => (
            <p key={i} className="mb-1 text-xs text-slate-300">
              <strong>{e.subject}：</strong>{e.advice}
            </p>
          ))}
        </div>
      )}
      {volunteer && volunteer.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-purple-200">志愿填报策略</h3>
          <ul className="list-inside list-disc text-xs text-slate-300">
            {volunteer.map((v, i) => (
              <li key={i}>{v}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
