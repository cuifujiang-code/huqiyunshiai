import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import ProtectedRouteAuth from './components/ProtectedRouteAuth'
import { AuthProvider } from './context/AuthContext'
import { MembershipProvider } from './context/MembershipContext'
import LoginPage from './pages/LoginPage'
import HomePage from './pages/HomePage'
import MemberCenterPage from './pages/MemberCenterPage'
import StudentDashboard from './pages/StudentDashboard'
import StudentDiagnosisPage from './pages/StudentDiagnosisPage'
import TeacherDashboard from './pages/TeacherDashboard'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <MembershipProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<HomePage />} />
            <Route
              path="/member-center"
              element={
                <ProtectedRouteAuth>
                  <MemberCenterPage />
                </ProtectedRouteAuth>
              }
            />
          <Route
            path="/teacher/dashboard"
            element={
              <ProtectedRoute requiredRole="teacher">
                <TeacherDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/student/diagnosis"
            element={
              <ProtectedRoute requiredRole="student">
                <StudentDiagnosisPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/student/dashboard"
            element={
              <ProtectedRoute requiredRole="student">
                <StudentDashboard />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </MembershipProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
