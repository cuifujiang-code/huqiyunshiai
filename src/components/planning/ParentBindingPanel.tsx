import { useState, useCallback } from 'react'
import { generateInviteCode, bindParent, fetchBindings, unbindParent } from '../../lib/educationPlanning'
import type { ParentBinding } from '../../types/planning'

interface Props {
  userId: string
  role: 'student' | 'parent' | 'teacher'
  onRefresh?: () => void
}

export default function ParentBindingPanel({ userId, role, onRefresh }: Props) {
  const [inviteCode, setInviteCode] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [inputCode, setInputCode] = useState('')
  const [bindings, setBindings] = useState<ParentBinding[]>([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [isWarning, setIsWarning] = useState(false)
  const [loaded, setLoaded] = useState(false)

  // 加载已有绑定关系
  const loadBindings = useCallback(async () => {
    try {
      const res = await fetchBindings({ user_id: userId, role: role === 'parent' ? 'parent' : 'student' })
      if (res.success) setBindings(res.bindings)
    } catch { /* 静默失败 */ }
    setLoaded(true)
  }, [userId, role])

  // 首次加载
  if (!loaded) {
    loadBindings()
    return (
      <div className="rounded-2xl border border-blue-500/20 bg-slate-900/60 p-6 text-center">
        <p className="text-xs text-slate-500">加载中…</p>
      </div>
    )
  }

  const handleGenerateCode = async () => {
    setLoading(true)
    setMessage('')
    try {
      const res = await generateInviteCode(userId)
      if (res.success) {
        setInviteCode(res.code)
        setExpiresAt(res.expires_at)
        setMessage(`邀请码已生成：${res.code}（7天有效）`)
      } else {
        setMessage(res.message || '生成失败')
        setIsWarning(true)
      }
    } catch {
      setMessage('网络错误，请重试')
      setIsWarning(true)
    } finally {
      setLoading(false)
    }
  }

  const handleBind = async () => {
    if (!inputCode.trim()) {
      setMessage('请输入邀请码')
      setIsWarning(true)
      return
    }
    setLoading(true)
    setMessage('')
    try {
      const res = await bindParent({ parent_user_id: userId, invite_code: inputCode.trim() })
      if (res.success) {
        setMessage('绑定成功！')
        setIsWarning(false)
        setInputCode('')
        loadBindings()
        onRefresh?.()
      } else {
        setMessage(res.message || '绑定失败')
        setIsWarning(true)
      }
    } catch {
      setMessage('网络错误，请重试')
      setIsWarning(true)
    } finally {
      setLoading(false)
    }
  }

  const handleUnbind = async (bindingId: string) => {
    if (!confirm('确认解绑？解绑后对方将无法查看你的学习数据。')) return
    setLoading(true)
    try {
      const res = await unbindParent(bindingId)
      if (res.success) {
        setMessage('解绑成功')
        loadBindings()
        onRefresh?.()
      } else {
        setMessage(res.message || '解绑失败')
        setIsWarning(true)
      }
    } catch {
      setMessage('网络错误')
      setIsWarning(true)
    } finally {
      setLoading(false)
    }
  }

  const copyCode = () => {
    if (inviteCode) {
      navigator.clipboard?.writeText(inviteCode)
      setMessage('邀请码已复制到剪贴板')
    }
  }

  return (
    <div className="rounded-2xl border border-blue-500/20 bg-slate-900/60 p-5">
      <h3 className="mb-1 text-sm font-semibold text-blue-100">家校绑定</h3>
      <p className="mb-4 text-xs text-slate-500">
        {role === 'student' ? '生成邀请码，让家长绑定查看你的学习数据' :
         role === 'parent' ? '输入学生邀请码，绑定查看学习数据' :
         '教师后台批量管理家长绑定'}
      </p>

      {/* 消息提示 */}
      {message && (
        <p className={`mb-3 rounded-lg border px-3 py-2 text-xs ${
          isWarning ? 'border-amber-500/40 bg-amber-500/15 text-amber-200' : 'border-blue-500/30 bg-blue-500/10 text-blue-200'
        }`}>
          {message}
        </p>
      )}

      {/* 学生端：生成邀请码 */}
      {role === 'student' && (
        <div className="space-y-3">
          {inviteCode ? (
            <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/10 p-4">
              <p className="text-xs text-slate-400">您的邀请码</p>
              <p className="mt-1 font-mono text-2xl font-bold tracking-widest text-cyan-300">{inviteCode}</p>
              <p className="mt-1 text-[10px] text-slate-500">有效期至：{expiresAt ? new Date(expiresAt).toLocaleString('zh-CN') : ''}</p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button" onClick={copyCode}
                  className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs text-cyan-200 hover:bg-cyan-500/20"
                >
                  复制邀请码
                </button>
                <button
                  type="button" onClick={handleGenerateCode} disabled={loading}
                  className="rounded-lg border border-slate-600 px-3 py-1 text-xs text-slate-400 hover:text-blue-200"
                >
                  重新生成
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button" onClick={handleGenerateCode} disabled={loading}
              className="w-full rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/30 transition hover:from-blue-500 hover:to-cyan-400 disabled:opacity-50"
            >
              {loading ? '生成中…' : '生成邀请码'}
            </button>
          )}

          {/* 已绑定的家长列表 */}
          {bindings.length > 0 && (
            <div>
              <p className="mb-2 text-xs text-slate-400">已绑定的家长（{bindings.length}/3）</p>
              {bindings.filter(b => b.status === 'active').map((b) => (
                <div key={b.id} className="mb-1.5 flex items-center justify-between rounded-lg bg-slate-800/40 px-3 py-2">
                  <span className="text-xs text-slate-300">家长 {b.parent_user_id?.slice(-6)}</span>
                  <button
                    type="button" onClick={() => handleUnbind(b.id)}
                    className="rounded px-2 py-0.5 text-[10px] text-red-400 hover:bg-red-500/10"
                  >
                    解绑
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 家长端：输入邀请码 */}
      {role === 'parent' && (
        <div className="space-y-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={inputCode}
              onChange={(e) => setInputCode(e.target.value)}
              placeholder="请输入6位数字邀请码"
              maxLength={6}
              className="flex-1 rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-3 text-center font-mono text-lg tracking-widest text-white outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/30"
            />
            <button
              type="button" onClick={handleBind} disabled={loading}
              className="rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/30 transition hover:from-blue-500 hover:to-cyan-400 disabled:opacity-50"
            >
              {loading ? '绑定中…' : '绑定'}
            </button>
          </div>
          <p className="text-[10px] text-slate-600">联系学生获取邀请码，每位家长最多绑定5名学生</p>

          {/* 已绑定的学生列表 */}
          {bindings.length > 0 && (
            <div>
              <p className="mb-2 text-xs text-slate-400">已绑定的学生（{bindings.length}/5）</p>
              {bindings.filter(b => b.status === 'active').map((b) => (
                <div key={b.id} className="mb-1.5 flex items-center justify-between rounded-lg bg-slate-800/40 px-3 py-2">
                  <span className="text-xs text-slate-300">学生 {b.student_user_id?.slice(-6)}</span>
                  <button
                    type="button" onClick={() => handleUnbind(b.id)}
                    className="rounded px-2 py-0.5 text-[10px] text-red-400 hover:bg-red-500/10"
                  >
                    解绑
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 规则说明 */}
      <div className="mt-4 rounded-lg border border-slate-700/40 p-3">
        <p className="text-[10px] text-slate-500">
          绑定规则：1名学生最多绑定3位家长 · 1位家长最多绑定5名学生 · 任意一方可发起解绑
          {role === 'parent' && ' · 家长端仅可查看，不能修改规划'}
        </p>
      </div>
    </div>
  )
}
