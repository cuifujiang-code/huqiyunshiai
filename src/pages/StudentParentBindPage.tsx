import { useCallback, useEffect, useState } from 'react'
import DashboardHeader from '../components/layout/DashboardHeader'
import { useAuth } from '../context/AuthContext'
import { fetchBindings, generateInviteCode } from '../lib/educationPlanning'
import type { ParentBinding } from '../types/planning'

export default function StudentParentBindPage() {
  const { user, profile } = useAuth()
  const studentId = user?.id ?? profile?.id ?? ''

  const [inviteCode, setInviteCode] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [parents, setParents] = useState<ParentBinding[]>([])
  const [loading, setLoading] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadParents = useCallback(async () => {
    if (!studentId) return
    const res = await fetchBindings({ user_id: studentId, role: 'student' })
    if (res.success) setParents(res.bindings.filter((b) => b.status === 'active'))
  }, [studentId])

  useEffect(() => {
    void loadParents()
  }, [loadParents])

  const handleGenerate = async () => {
    if (!studentId) {
      setError('请先登录学生账号')
      return
    }
    setLoading(true)
    setError(null)
    setNotice(null)
    const res = await generateInviteCode(studentId)
    setLoading(false)
    if (res.success && res.code) {
      setInviteCode(res.code)
      setExpiresAt(res.expires_at ?? '')
      setNotice('邀请码已生成，7 天内有效，可分享给多位家长注册绑定')
    } else {
      setError(res.message || '生成失败')
    }
  }

  const copyCode = async () => {
    if (!inviteCode) return
    try {
      await navigator.clipboard.writeText(inviteCode)
      setNotice('已复制邀请码')
    } catch {
      setNotice('请手动复制：' + inviteCode)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <DashboardHeader
        title="家长绑定"
        backTo="/student/dashboard"
        backLabel="返回学习中心"
        featureNavRole="student"
      />

      <main className="mx-auto max-w-lg px-4 py-8 sm:px-6">
        <p className="text-sm text-slate-400">
          生成邀请码并分享给家长。家长注册时选择「家长」身份并填写邀请码即可完成绑定。一名学生可绑定多名家长。
        </p>

        <button
          type="button"
          disabled={loading}
          onClick={() => void handleGenerate()}
          className="mt-6 w-full rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 py-3 text-sm font-semibold disabled:opacity-50"
        >
          {loading ? '生成中…' : '生成邀请码'}
        </button>

        {inviteCode && (
          <div className="mt-6 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5 text-center">
            <p className="text-xs text-emerald-200/80">邀请码（分享给家长）</p>
            <p className="mt-2 font-mono text-3xl font-bold tracking-widest text-emerald-100">{inviteCode}</p>
            {expiresAt && (
              <p className="mt-2 text-xs text-slate-400">
                有效期至 {new Date(expiresAt).toLocaleString('zh-CN')}
              </p>
            )}
            <button
              type="button"
              onClick={() => void copyCode()}
              className="mt-4 rounded-lg border border-emerald-400/40 px-4 py-2 text-sm text-emerald-200 hover:bg-emerald-500/20"
            >
              复制邀请码
            </button>
          </div>
        )}

        {error && (
          <p className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>
        )}
        {notice && (
          <p className="mt-4 rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-sm text-blue-200">{notice}</p>
        )}

        <section className="mt-10">
          <h2 className="text-sm font-medium text-slate-300">已绑定家长（{parents.length}）</h2>
          {parents.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">暂无绑定，请将邀请码发给家长完成注册</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {parents.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between rounded-xl border border-slate-700 bg-slate-900/60 px-4 py-3 text-sm"
                >
                  <span>家长 {p.parent_user_id.slice(-6)}</span>
                  <span className="text-xs text-slate-500">
                    {p.bound_at ? new Date(p.bound_at).toLocaleDateString('zh-CN') : '—'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  )
}
