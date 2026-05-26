import { NavLink } from 'react-router-dom'

interface Props {
  role: 'teacher' | 'student'
}

const teacherLinks = [
  { to: '/teacher/dashboard', label: 'AI智能出题' },
  { to: '/teacher/planning', label: 'AI教育规划' },
]

const studentLinks = [
  { to: '/student/dashboard', label: '学习中心' },
  { to: '/student/diagnosis', label: 'AI学习诊断' },
  { to: '/student/planning', label: 'AI教育规划' },
]

export default function FeatureNav({ role }: Props) {
  const links = role === 'teacher' ? teacherLinks : studentLinks

  return (
    <nav className="border-b border-blue-500/15 bg-slate-900/40">
      <div className="mx-auto flex max-w-[1600px] gap-1 overflow-x-auto px-4 py-2 sm:px-6">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            className={({ isActive }) =>
              `shrink-0 rounded-lg px-3 py-1.5 text-sm transition ${
                isActive
                  ? 'bg-blue-500/20 font-medium text-cyan-300'
                  : 'text-slate-400 hover:bg-slate-800/60 hover:text-blue-200'
              }`
            }
          >
            {link.label}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
