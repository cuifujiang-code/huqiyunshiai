import type { SubscriptionPlan } from '../../types/membership'

interface Props {
  plan: SubscriptionPlan
  onSubscribe: (plan: SubscriptionPlan) => void
  disabled?: boolean
}

export default function PlanCard({ plan, onSubscribe, disabled }: Props) {
  const isRecommended = plan.recommended

  return (
    <div
      className={`group relative flex flex-col rounded-2xl border bg-slate-900/60 p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl ${
        isRecommended
          ? 'border-amber-400/70 shadow-lg shadow-amber-500/10 hover:border-amber-300 hover:shadow-amber-500/20'
          : 'border-blue-500/20 hover:border-blue-400/50 hover:shadow-blue-900/20'
      } ${disabled ? 'pointer-events-none opacity-50' : ''}`}
    >
      {plan.badge && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-amber-500 to-yellow-400 px-4 py-1 text-xs font-bold text-slate-900 shadow-md">
          {plan.badge}
        </span>
      )}
      <h3 className="text-lg font-semibold text-blue-100">{plan.name}</h3>
      <p className="mt-2 text-2xl font-bold text-white">{plan.priceLabel}</p>
      {plan.id === 'teacher_yearly' && (
        <p className="mt-1 text-xs text-emerald-400">相当于每月33元，节省189元</p>
      )}
      <ul className="mt-5 flex-1 space-y-2.5">
        {plan.features.map((f) => (
          <li key={f} className="flex gap-2 text-sm text-slate-300">
            <span className="text-cyan-400">✓</span>
            <span>{f}</span>
          </li>
        ))}
      </ul>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onSubscribe(plan)}
        className={`mt-6 w-full rounded-xl py-3 text-sm font-semibold transition ${
          isRecommended
            ? 'bg-gradient-to-r from-amber-500 to-yellow-400 text-slate-900 hover:from-amber-400 hover:to-yellow-300'
            : 'bg-gradient-to-r from-blue-600 to-cyan-500 text-white hover:from-blue-500 hover:to-cyan-400'
        }`}
      >
        {plan.cta}
      </button>
    </div>
  )
}
