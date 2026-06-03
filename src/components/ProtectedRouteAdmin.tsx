import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

interface Props {
  children: React.ReactNode
}

export default function ProtectedRouteAdmin({ children }: Props) {
  const { isAuthenticated, profile, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (profile?.role !== 'admin') {
    const redirectTo = profile?.role === 'teacher' ? '/teacher/dashboard' : '/student/dashboard'
    return <Navigate to={redirectTo} replace />
  }

  return <>{children}</>
}
