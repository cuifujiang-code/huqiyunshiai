import type { PlanningReport } from '../../types/planning'
import RadarChart from './RadarChart'

interface Props {
  report: PlanningReport
}

export default function StudentProfileCard({ report }: Props) {
  const { studentProfile, abilityDimensions } = report

  return (
    <section className="rounded-2xl border border-blue-500/20 bg-slate-900/60 p-5 sm:p-6">
      <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-blue-100">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500/20 text-sm">1</span>
        学生画像
      </h3>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <InfoItem label="姓名" value={studentProfile.name} />
            <InfoItem label="年级" value={studentProfile.grade} />
            <InfoItem label="成绩水平" value={studentProfile.scoreLevel} />
            <InfoItem label="兴趣" value={studentProfile.interests.join('、') || '未填写'} />
          </div>
          <InfoItem label="目标方向" value={studentProfile.goalDirections.join('、')} />
          {studentProfile.parentExpectations && studentProfile.parentExpectations !== '未填写' && (
            <InfoItem label="家长期望" value={studentProfile.parentExpectations} />
          )}
        </div>
        <div>
          <p className="mb-2 text-center text-xs text-slate-400">能力维度雷达图</p>
          <RadarChart dimensions={abilityDimensions} />
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {abilityDimensions.map((d) => (
              <span key={d.label} className="rounded-full bg-blue-500/10 px-2 py-0.5 text-xs text-blue-200">
                {d.label} {d.score}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-700/60 bg-slate-800/40 px-3 py-2">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-0.5 font-medium text-slate-200">{value}</p>
    </div>
  )
}
