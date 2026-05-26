import { useNavigate } from 'react-router-dom'
import type { MembershipState } from '../../types/membership'
import type { UserRole } from '../../lib/supabase'
import { getUsageSummary } from '../../lib/membershipStorage'

interface Props {
  membership: MembershipState
  role: UserRole
  statusLabel: string
  onRenew: () => void
  onUpgrade: () => void
}

export default function SubscribedStatusPanel({
  membership,
  role,
  statusLabel,
  onRenew,
  onUpgrade,
}: Props) {
  const navigate = useNavigate()
  const usage = getUsageSummary(membership, role)

  const expiresText = membership.expiresAt
    ? new Date(membership.expiresAt).toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : membership.perUseDiagnosisCredits > 0
      ? '按次购买，用完即止'
      : '—'

  return (
    <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-6 sm:p-8">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-medium text-emerald-300">
          已订阅
        </span>
        <h2 className="text-xl font-semibold text-emerald-100">{statusLabel}</h2>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-700/80 bg-slate-900/50 p-4">
          <p className="text-xs text-slate-500">会员到期时间</p>
          <p className="mt-1 text-lg font-medium text-white">{expiresText}</p>
        </div>
        <div className="rounded-xl border border-slate-700/80 bg-slate-900/50 p-4">
          <p className="text-xs text-slate-500">功能使用情况</p>
          <p className="mt-1 text-lg font-medium text-white">
            {usage.unlimited
              ? `${usage.label}：无限次（本月已用 ${usage.used} 次）`
              : usage.label === '诊断次数'
                ? `${usage.label}：剩余 ${usage.limit} 次`
                : `${usage.label}：已用 ${usage.used} / ${usage.limit} 次`}
          </p>
        </div>
      </div>

      {membership.subscriptionStart && (
        <p className="mt-4 text-sm text-slate-500">
          订阅开始：{new Date(membership.subscriptionStart).toLocaleDateString('zh-CN')}
        </p>
      )}

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={onRenew}
          className="flex-1 rounded-xl border border-emerald-500/40 bg-emerald-500/10 py-2.5 text-sm font-medium text-emerald-200 transition hover:bg-emerald-500/20"
        >
          续费
        </button>
        <button
          type="button"
          onClick={onUpgrade}
          className="flex-1 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 py-2.5 text-sm font-semibold text-slate-900 transition hover:from-amber-400 hover:to-yellow-300"
        >
          升级
        </button>
        <button
          type="button"
          onClick={() => navigate(role === 'teacher' ? '/teacher/dashboard' : '/student/dashboard')}
          className="flex-1 rounded-xl border border-slate-600 py-2.5 text-sm text-slate-300 transition hover:border-blue-500/50"
        >
          返回工作台
        </button>
      </div>
    </div>
  )
}
