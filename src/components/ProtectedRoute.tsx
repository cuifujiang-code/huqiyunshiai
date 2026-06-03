import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import type { UserRole } from '../lib/supabase'

interface ProtectedRouteProps {
  children: React.ReactNode
  requiredRole: UserRole
}

export default function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
  const { isAuthenticated, profile, loading } = useAuth()

  if (loading) {
    return <LoadingSpinner />
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (profile && profile.role !== requiredRole) {
    if (requiredRole === 'teacher' && profile.role === 'admin') {
      return <>{children}</>
    }
    const redirectTo =
      profile.role === 'admin'
        ? '/admin/dashboard'
        : profile.role === 'teacher'
          ? '/teacher/dashboard'
          : profile.role === 'parent'
            ? '/parent/dashboard'
            : '/student/dashboard'
    return <Navigate to={redirectTo} replace />
  }

  return <>{children}</>
}

function LoadingSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-blue-400 border-t-transparent" />
    </div>
  )
}
