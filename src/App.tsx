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
import StudentPlanningPage from './pages/StudentPlanningPage'
import TeacherBookBuilderPage from './pages/TeacherBookBuilderPage'
import TeacherDashboard from './pages/TeacherDashboard'
import TeacherExamBuilderPage from './pages/TeacherExamBuilderPage'
import TeacherExamPage from './pages/TeacherExamPage'
import TeacherHandoutBuilderPage from './pages/TeacherHandoutBuilderPage'
import TeacherLessonPrepPage from './pages/TeacherLessonPrepPage'
import TeacherPlanningPage from './pages/TeacherPlanningPage'
import TeacherQuestionBankPage from './pages/TeacherQuestionBankPage'

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
              path="/teacher/exam"
              element={
                <ProtectedRoute requiredRole="teacher">
                  <TeacherExamPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/teacher/question-bank"
              element={
                <ProtectedRoute requiredRole="teacher">
                  <TeacherQuestionBankPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/teacher/lesson-prep"
              element={
                <ProtectedRoute requiredRole="teacher">
                  <TeacherLessonPrepPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/teacher/exam-builder"
              element={
                <ProtectedRoute requiredRole="teacher">
                  <TeacherExamBuilderPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/teacher/handout-builder"
              element={
                <ProtectedRoute requiredRole="teacher">
                  <TeacherHandoutBuilderPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/teacher/book-builder"
              element={
                <ProtectedRoute requiredRole="teacher">
                  <TeacherBookBuilderPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/teacher/planning"
              element={
                <ProtectedRoute requiredRole="teacher">
                  <TeacherPlanningPage />
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
            <Route
              path="/student/diagnosis"
              element={
                <ProtectedRoute requiredRole="student">
                  <StudentDiagnosisPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/student/planning"
              element={
                <ProtectedRoute requiredRole="student">
                  <StudentPlanningPage />
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
