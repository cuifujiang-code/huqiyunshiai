import { useCallback, useEffect, useState } from 'react'
import DashboardHeader from '../../components/layout/DashboardHeader'
import {
  fetchAdminStats,
  fetchAdminUsers,
  giftUserMembershipDays,
  setUserMembershipExpiry,
  type AdminStats,
  type AdminUserRow,
} from '../../lib/adminApi'
import { btnSecondary, inputClass } from '../../types/teacher'

const ROLE_LABELS: Record<string, string> = {
  teacher: '教师',
  student: '学生',
  admin: '管理员',
}

const MEMBERSHIP_LABELS: Record<string, string> = {
  free: '免费',
  teacher_monthly: '教师月费',
  teacher_yearly: '教师年费',
  student_per_use: '学生按次',
  student_yearly: '学生年费',
}

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [users, setUsers] = useState<AdminUserRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [keyword, setKeyword] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<string | null>(null)
  const [actionUserId, setActionUserId] = useState<string | null>(null)

  const pageSize = 15
  const pageCount = Math.max(1, Math.ceil(total / pageSize))

  const loadStats = useCallback(async () => {
    try {
      setStats(await fetchAdminStats())
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '加载统计失败')
    }
  }, [])

  const loadUsers = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchAdminUsers({ page, pageSize, keyword })
      setUsers(data.items)
      setTotal(data.total)
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '加载用户失败')
    } finally {
      setLoading(false)
    }
  }, [page, keyword])

  useEffect(() => {
    void loadStats()
  }, [loadStats])

  useEffect(() => {
    void loadUsers()
  }, [loadUsers])

  const handleSearch = () => {
    setKeyword(searchInput.trim())
    setPage(1)
  }

  const handleRenew = async (user: AdminUserRow) => {
    const raw = prompt(
      '设置会员到期时间（格式 YYYY-MM-DD，留空表示取消会员）',
      user.expires_at ? user.expires_at.slice(0, 10) : '',
    )
    if (raw === null) return

    setActionUserId(user.id)
    try {
      const expiresAt = raw.trim() ? new Date(`${raw.trim()}T23:59:59`).toISOString() : null
      await setUserMembershipExpiry(user.id, expiresAt)
      setMessage('会员到期时间已更新')
      await loadUsers()
      await loadStats()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '更新失败')
    } finally {
      setActionUserId(null)
    }
  }

  const handleGift = async (user: AdminUserRow) => {
    const raw = prompt('赠送会员天数（正整数）', '30')
    if (raw === null) return
    const days = Number.parseInt(raw, 10)
    if (!Number.isFinite(days) || days < 1) {
      setMessage('请输入有效天数')
      return
    }

    setActionUserId(user.id)
    try {
      await giftUserMembershipDays(user.id, days)
      setMessage(`已赠送 ${days} 天会员`)
      await loadUsers()
      await loadStats()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '赠送失败')
    } finally {
      setActionUserId(null)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <DashboardHeader title="后台管理" backTo="/teacher/dashboard" backLabel="返回" />

      <main className="mx-auto max-w-6xl px-4 py-6">
        {message && (
          <p className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
            {message}
          </p>
        )}

        {/* 统计卡片 */}
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <StatCard title="总用户数" value={stats ? String(stats.totalUsers) : '—'} accent="blue" />
          <StatCard title="今日新增" value={stats ? String(stats.todayNew) : '—'} accent="cyan" />
          <StatCard
            title="今日收入"
            value={stats ? `￥${stats.todayRevenueYuan}` : '—'}
            accent="amber"
            hint="来自 payment_records 表"
          />
        </div>

        {/* 用户列表 */}
        <section className="rounded-2xl border border-slate-700 bg-slate-900/60 p-4">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-white">用户列表</h2>
            <div className="flex min-w-[200px] flex-1 gap-2">
              <input
                className={`${inputClass} py-2 text-sm`}
                placeholder="搜索手机号"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
              <button type="button" className={btnSecondary} onClick={handleSearch}>
                搜索
              </button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-700">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-slate-800/80 text-xs text-slate-400">
                <tr>
                  <th className="px-3 py-2">手机号</th>
                  <th className="px-3 py-2">角色</th>
                  <th className="px-3 py-2">注册时间</th>
                  <th className="px-3 py-2">会员类型</th>
                  <th className="px-3 py-2">会员到期</th>
                  <th className="px-3 py-2 text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-12 text-center text-slate-500">
                      加载中…
                    </td>
                  </tr>
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-12 text-center text-slate-500">
                      暂无用户
                    </td>
                  </tr>
                ) : (
                  users.map((u) => (
                    <tr key={u.id} className="border-t border-slate-800 hover:bg-slate-800/40">
                      <td className="px-3 py-2 font-mono text-slate-200">{u.phoneMasked}</td>
                      <td className="px-3 py-2">
                        <span className="rounded bg-slate-700 px-2 py-0.5 text-xs">
                          {ROLE_LABELS[u.role] ?? u.role}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-slate-400">{formatDate(u.created_at)}</td>
                      <td className="px-3 py-2 text-slate-300">
                        {MEMBERSHIP_LABELS[u.membership_type] ?? u.membership_type}
                      </td>
                      <td className="px-3 py-2 text-slate-300">{formatDate(u.expires_at)}</td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            className="rounded px-2 py-1 text-xs text-cyan-400 hover:bg-slate-700"
                            disabled={actionUserId === u.id}
                            onClick={() => void handleRenew(u)}
                          >
                            开通/续费
                          </button>
                          <button
                            type="button"
                            className="rounded px-2 py-1 text-xs text-amber-400 hover:bg-slate-700"
                            disabled={actionUserId === u.id}
                            onClick={() => void handleGift(u)}
                          >
                            赠送天数
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex items-center justify-between text-sm text-slate-400">
            <span>共 {total} 人</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                className={btnSecondary}
                onClick={() => setPage((p) => p - 1)}
              >
                上一页
              </button>
              <span>
                {page} / {pageCount}
              </span>
              <button
                type="button"
                disabled={page >= pageCount}
                className={btnSecondary}
                onClick={() => setPage((p) => p + 1)}
              >
                下一页
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}

function StatCard({
  title,
  value,
  accent,
  hint,
}: {
  title: string
  value: string
  accent: 'blue' | 'cyan' | 'amber'
  hint?: string
}) {
  const border =
    accent === 'amber'
      ? 'border-amber-500/30'
      : accent === 'cyan'
        ? 'border-cyan-500/30'
        : 'border-blue-500/30'
  const text =
    accent === 'amber' ? 'text-amber-300' : accent === 'cyan' ? 'text-cyan-300' : 'text-blue-300'

  return (
    <div className={`rounded-2xl border ${border} bg-slate-900/60 p-5`}>
      <p className="text-sm text-slate-400">{title}</p>
      <p className={`mt-2 text-3xl font-bold ${text}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-600">{hint}</p>}
    </div>
  )
}
