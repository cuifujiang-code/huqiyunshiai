import { useState } from 'react'
import type { PaymentMethod } from '../../types/membership'
import type { SubscriptionPlan } from '../../types/membership'

interface Props {
  plan: SubscriptionPlan
  open: boolean
  onClose: () => void
  onConfirm: (method: PaymentMethod) => void
}

export default function PaymentModal({ plan, open, onClose, onConfirm }: Props) {
  const [method, setMethod] = useState<PaymentMethod>('wechat')

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div
        className="w-full max-w-md rounded-2xl border border-blue-500/30 bg-slate-900 p-6 shadow-2xl"
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-start justify-between">
          <h3 className="text-lg font-semibold text-blue-100">确认订单</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
            aria-label="关闭"
          >
            ✕
          </button>
        </div>

        <div className="mt-4 rounded-xl border border-slate-700/80 bg-slate-800/50 p-4">
          <p className="text-sm text-slate-400">方案名称</p>
          <p className="mt-1 font-medium text-white">{plan.name}</p>
          <p className="mt-3 text-sm text-slate-400">支付金额</p>
          <p className="mt-1 text-2xl font-bold text-cyan-300">￥{plan.price}</p>
        </div>

        <p className="mt-5 text-sm font-medium text-slate-300">选择支付方式</p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setMethod('wechat')}
            className={`flex flex-col items-center gap-2 rounded-xl border p-4 transition ${
              method === 'wechat'
                ? 'border-emerald-500/60 bg-emerald-500/10 ring-2 ring-emerald-500/40'
                : 'border-slate-700 hover:border-slate-500'
            }`}
          >
            <span className="text-3xl" aria-hidden>
              💬
            </span>
            <span className="text-sm font-medium text-slate-200">微信支付</span>
          </button>
          <button
            type="button"
            onClick={() => setMethod('alipay')}
            className={`flex flex-col items-center gap-2 rounded-xl border p-4 transition ${
              method === 'alipay'
                ? 'border-blue-500/60 bg-blue-500/10 ring-2 ring-blue-500/40'
                : 'border-slate-700 hover:border-slate-500'
            }`}
          >
            <span className="text-3xl" aria-hidden>
              💳
            </span>
            <span className="text-sm font-medium text-slate-200">支付宝</span>
          </button>
        </div>

        <button
          type="button"
          onClick={() => onConfirm(method)}
          className="mt-6 w-full rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 py-3 text-sm font-semibold text-white transition hover:from-blue-500 hover:to-cyan-400"
        >
          确认支付
        </button>
        <p className="mt-3 text-center text-xs text-slate-500">模拟支付，不会产生真实扣款</p>
      </div>
    </div>
  )
}
