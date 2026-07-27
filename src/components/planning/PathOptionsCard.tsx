import type { PlanningPathOption } from '../../types/planning'

const PATH_STYLES = [
  {
    label: '主路径',
    border: 'border-green-500/40',
    bg: 'bg-green-500/10',
    badge: 'bg-green-500/20 text-green-300',
    bar: 'bg-green-500',
  },
  {
    label: '备选路径',
    border: 'border-blue-500/40',
    bg: 'bg-blue-500/10',
    badge: 'bg-blue-500/20 text-blue-300',
    bar: 'bg-blue-500',
  },
  {
    label: '保底路径',
    border: 'border-amber-500/40',
    bg: 'bg-amber-500/10',
    badge: 'bg-amber-500/20 text-amber-300',
    bar: 'bg-amber-500',
  },
] as const

interface Props {
  pathOptions: PlanningPathOption[]
}

export default function PathOptionsCard({ pathOptions }: Props) {
  const options = pathOptions.slice(0, 3)
  if (!options.length) return null

  return (
    <section className="rounded-2xl border border-white/[0.06] bg-[#1C2332]/80 p-5">
      <div className="mb-4 flex items-center justify-between border-b border-white/[0.06] pb-3">
        <div>
          <h3 className="text-sm font-semibold text-[#E8ECF3]">推荐路径</h3>
          <p className="mt-0.5 text-xs text-[#6B7588]">主路径 / 备选 / 保底 三轨对比</p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {options.map((opt, i) => {
          const style = PATH_STYLES[i] ?? PATH_STYLES[2]
          return (
            <div
              key={`${opt.name}-${i}`}
              className={`rounded-xl border p-4 ${style.border} ${style.bg}`}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${style.badge}`}>
                  {style.label}
                </span>
                <span className="text-lg font-bold tabular-nums text-[#E8ECF3]">{opt.matchScore}</span>
              </div>
              <h4 className="text-sm font-semibold text-[#E8ECF3]">{opt.name}</h4>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                <div
                  className={`h-full rounded-full ${style.bar}`}
                  style={{ width: `${Math.min(100, opt.matchScore)}%` }}
                />
              </div>
              <p className="mt-3 text-xs leading-relaxed text-[#8A94A9]">{opt.reason}</p>
              {opt.keyActions?.length > 0 && (
                <ul className="mt-3 space-y-1 border-t border-white/[0.06] pt-3">
                  {opt.keyActions.map((action) => (
                    <li key={action} className="text-[11px] text-[#B0B9C8]">
                      · {action}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
