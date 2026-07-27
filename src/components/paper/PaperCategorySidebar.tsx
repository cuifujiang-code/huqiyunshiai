import type { PaperCategory } from '../../types/paper'
import { PAPER_SUBJECTS } from '../../types/paper'

interface Props {
  categories: PaperCategory[]
  selectedSubject: string
  selectedCategoryId: string
  onSubjectSelect: (subject: string) => void
  onCategorySelect: (id: string, name: string) => void
  collapsed: boolean
  onToggleCollapse: () => void
}

export default function PaperCategorySidebar({
  categories,
  selectedSubject,
  selectedCategoryId,
  onSubjectSelect,
  onCategorySelect,
  collapsed,
  onToggleCollapse,
}: Props) {
  return (
    <div className="flex h-full flex-col border-r border-white/[0.06] bg-[#121722]" style={{ width: collapsed ? 48 : 240 }}>
      <div className="flex items-center justify-between border-b border-white/[0.04] px-3 py-3">
        {!collapsed && <span className="text-sm font-medium text-[#E8ECF3]">试题试卷</span>}
        <button
          type="button"
          className="rounded p-1 text-[#8A94A9] hover:bg-white/[0.06] hover:text-[#E8ECF3]"
          onClick={onToggleCollapse}
          title={collapsed ? '展开' : '收起'}
        >
          {collapsed ? '»' : '«'}
        </button>
      </div>
      {!collapsed && (
        <nav className="flex-1 overflow-y-auto py-2 text-sm">
          <div className="px-2 pb-2 mb-1 border-b border-white/[0.04]">
            <p className="px-2 pb-1 text-[10px] uppercase tracking-wide text-[#6B7280]">学科</p>
            <button
              type="button"
              className={`block w-full px-3 py-1.5 text-left text-xs rounded transition ${!selectedSubject ? 'bg-[#2584FF]/15 text-[#5C9DFF]' : 'text-[#8A94A9] hover:bg-white/[0.04] hover:text-[#E8ECF3]'}`}
              onClick={() => onSubjectSelect('')}
            >
              全部学科
            </button>
            {PAPER_SUBJECTS.map((s) => (
              <button
                key={s}
                type="button"
                className={`block w-full px-3 py-1.5 text-left text-xs rounded transition ${selectedSubject === s ? 'bg-[#2584FF]/15 text-[#5C9DFF] font-medium' : 'text-[#C8CFDF] hover:bg-white/[0.04]'}`}
                onClick={() => onSubjectSelect(s)}
              >
                {s}
              </button>
            ))}
          </div>

          <p className="px-4 pb-1 text-[10px] uppercase tracking-wide text-[#6B7280]">分类</p>
          <button
            type="button"
            className={`block w-full px-4 py-2 text-left transition ${!selectedCategoryId ? 'bg-[#2584FF]/15 text-[#5C9DFF]' : 'text-[#8A94A9] hover:bg-white/[0.04] hover:text-[#E8ECF3]'}`}
            onClick={() => onCategorySelect('', '全部')}
          >
            全部试卷
          </button>
          {categories.map((cat) => (
            <div key={cat.id}>
              <button
                type="button"
                className={`block w-full px-4 py-2 text-left font-medium transition ${selectedCategoryId === cat.id ? 'bg-[#2584FF]/15 text-[#5C9DFF]' : 'text-[#C8CFDF] hover:bg-white/[0.04]'}`}
                onClick={() => onCategorySelect(cat.id, cat.category_name)}
              >
                {cat.category_name}
              </button>
              {cat.children?.map((sub) => (
                <button
                  key={sub.id}
                  type="button"
                  className={`block w-full py-1.5 pl-8 pr-4 text-left text-xs transition ${selectedCategoryId === sub.id ? 'bg-[#2584FF]/10 text-[#5C9DFF]' : 'text-[#8A94A9] hover:text-[#C8CFDF]'}`}
                  onClick={() => onCategorySelect(sub.id, sub.category_name)}
                >
                  {sub.category_name}
                </button>
              ))}
            </div>
          ))}
        </nav>
      )}
    </div>
  )
}
