import { useNavigate } from 'react-router-dom'
import Logo from '../Logo'
import { useAuth } from '../../context/AuthContext'
import { useMembership } from '../../context/MembershipContext'

interface Props {
  title: string
  backTo?: string
  backLabel?: string
}

export default function DashboardHeader({ title, backTo, backLabel = '返回' }: Props) {
  const navigate = useNavigate()
  const { profile, signOut } = useAuth()
  const { statusLabel } = useMembership()

  const handleSignOut = async () => {
    await signOut()
    navigate('/login', { replace: true })
  }

  const homePath = profile?.role === 'teacher' ? '/teacher/dashboard' : '/student/dashboard'

  return (
    <header className="border-b border-blue-500/20 bg-slate-900/80 backdrop-blur-sm">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
        <Logo size="sm" />
        <div className="flex flex-1 flex-wrap items-center justify-end gap-2 sm:gap-3">
          <span className="hidden text-sm text-slate-400 sm:inline">{title}</span>
          {profile && (
            <span className="hidden max-w-[140px] truncate text-xs text-slate-500 md:inline" title={statusLabel}>
              {statusLabel}
            </span>
          )}
          <button
            type="button"
            onClick={() => navigate('/member-center')}
            className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-sm text-amber-200 transition hover:border-amber-400/60 hover:bg-amber-500/20"
          >
            会员中心
          </button>
          {backTo && (
            <button
              type="button"
              onClick={() => navigate(backTo)}
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 transition hover:border-blue-500/50"
            >
              {backLabel}
            </button>
          )}
          {!backTo && (
            <button
              type="button"
              onClick={() => navigate(homePath)}
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 transition hover:border-blue-500/50 sm:hidden"
            >
              首页
            </button>
          )}
          <button
            type="button"
            onClick={handleSignOut}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 transition hover:border-blue-500/50 hover:text-blue-200"
          >
            退出
          </button>
        </div>
      </div>
    </header>
  )
}
