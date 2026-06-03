import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'

interface QuickAction {
  icon: string
  label: string
  path: string
}

const TEACHER_ACTIONS: QuickAction[] = [
  { icon: '+', label: '新建组卷', path: '/teacher/exam-builder' },
  { icon: '☰', label: '批量拆题', path: '/teacher/question-bank' },
  { icon: '📋', label: '智能备课', path: '/teacher/lesson-prep' },
  { icon: '⬇', label: '排版导出', path: '/teacher/exam-layout' },
]

export default function FloatingActionButton() {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const location = useLocation()

  // 仅在教师页面显示
  const isTeacherPage = location.pathname.startsWith('/teacher')

  // 点击外部关闭菜单
  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  if (!isTeacherPage) return null

  return (
    <div ref={menuRef} className="fixed bottom-7 right-7 z-50 flex flex-col items-end gap-2">
      {/* 快捷菜单 */}
      {open && (
        <div className="mb-1 flex flex-col gap-1.5 rounded-[12px] border border-white/[0.06] bg-[#1C2332] p-2 shadow-xl shadow-black/40">
          {TEACHER_ACTIONS.map((action) => (
            <button
              key={action.path}
              type="button"
              onClick={() => {
                navigate(action.path)
                setOpen(false)
              }}
              className="flex items-center gap-2 whitespace-nowrap rounded-[8px] px-3 py-2 text-sm text-[#E8ECF3] transition hover:bg-[#222B3E] hover:text-[#2584FF]"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-[6px] bg-[#2584FF]/15 text-xs text-[#2584FF]">
                {action.icon}
              </span>
              {action.label}
            </button>
          ))}
        </div>
      )}

      {/* 主按钮 */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`flex h-[52px] w-[52px] items-center justify-center rounded-full text-[22px] text-white shadow-lg transition-all duration-200 ${
          open
            ? 'rotate-45 bg-[#EF4444] shadow-[#EF4444]/30'
            : 'bg-[#2584FF] shadow-[#2584FF]/40 hover:scale-110 hover:bg-[#0F70E8]'
        }`}
        title="快捷操作"
      >
        +
      </button>
    </div>
  )
}
