import type { PaperFilters } from '../../types/paper'
import { PAPER_AREAS, PAPER_FILE_TYPES, PAPER_GRADES, PAPER_LEVELS, PAPER_SUBJECTS_FILTER, PAPER_YEARS } from '../../types/paper'

interface Props {
  filters: PaperFilters
  onChange: (patch: Partial<PaperFilters>) => void
  isTeacher: boolean
  syncHref?: string
  onUpload?: () => void
  onOpenBasket?: () => void
  basketCount?: number
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2 py-1">
      <span className="w-12 shrink-0 text-xs text-[#8A94A9]">{label}</span>
      <div className="flex flex-1 flex-wrap gap-1">{children}</div>
    </div>
  )
}

function Tag({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-2.5 py-0.5 text-xs transition ${
        active
          ? 'bg-[#2584FF]/20 text-[#5C9DFF] border border-[#2584FF]/30'
          : 'bg-white/[0.04] text-[#8A94A9] border border-white/[0.06] hover:text-[#E8ECF3]'
      }`}
    >
      {children}
    </button>
  )
}

export default function PaperFilterBar({ filters, onChange, isTeacher, syncHref, onUpload, onOpenBasket, basketCount = 0 }: Props) {
  return (
    <div className="shrink-0 space-y-1 border-b border-white/[0.04] bg-[#161c28] px-5 py-3">
      <FilterRow label="学科">
        <select
          className="rounded border border-white/[0.08] bg-[#1C2332] px-2 py-1 text-xs text-[#E8ECF3] min-w-[100px]"
          value={filters.subject}
          onChange={(e) => onChange({ subject: e.target.value })}
        >
          {PAPER_SUBJECTS_FILTER.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </FilterRow>
      <FilterRow label="年级">
        {PAPER_GRADES.map((g) => (
          <Tag key={g} active={filters.grade === g} onClick={() => onChange({ grade: g })}>{g}</Tag>
        ))}
      </FilterRow>
      <FilterRow label="年份">
        {PAPER_YEARS.slice(0, 8).map((y) => (
          <Tag key={y} active={filters.exam_year === y} onClick={() => onChange({ exam_year: y })}>{y}</Tag>
        ))}
        <select
          className="rounded border border-white/[0.08] bg-[#1C2332] px-2 py-0.5 text-xs text-[#E8ECF3]"
          value={filters.exam_year}
          onChange={(e) => onChange({ exam_year: e.target.value })}
        >
          {PAPER_YEARS.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </FilterRow>
      <FilterRow label="地区">
        <select
          className="rounded border border-white/[0.08] bg-[#1C2332] px-2 py-1 text-xs text-[#E8ECF3] min-w-[120px]"
          value={filters.area}
          onChange={(e) => onChange({ area: e.target.value })}
        >
          {PAPER_AREAS.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
      </FilterRow>
      <FilterRow label="等级">
        {PAPER_LEVELS.map((l) => (
          <Tag key={l} active={filters.level === l} onClick={() => onChange({ level: l })}>{l}</Tag>
        ))}
      </FilterRow>
      <FilterRow label="类型">
        {PAPER_FILE_TYPES.map((t) => (
          <Tag key={t} active={filters.file_type === t} onClick={() => onChange({ file_type: t })}>{t}</Tag>
        ))}
      </FilterRow>
      <div className="flex flex-wrap items-center gap-4 pt-2">
        <label className="flex items-center gap-1.5 text-xs text-[#8A94A9] cursor-pointer">
          <input type="checkbox" checked={filters.has_answer} onChange={(e) => onChange({ has_answer: e.target.checked })} className="accent-[#2584FF]" />
          答案
        </label>
        <label className="flex items-center gap-1.5 text-xs text-[#8A94A9] cursor-pointer">
          <input type="checkbox" checked={filters.has_analysis} onChange={(e) => onChange({ has_analysis: e.target.checked })} className="accent-[#2584FF]" />
          解析
        </label>
        <input
          className="rounded-[8px] border border-white/[0.08] bg-[#1C2332] px-3 py-1.5 text-xs text-[#E8ECF3] placeholder-[#8A94A9] outline-none focus:border-[#2584FF] flex-1 min-w-[160px] max-w-xs"
          placeholder="搜索试卷标题…"
          value={filters.keyword}
          onChange={(e) => onChange({ keyword: e.target.value })}
        />
        <div className="flex-1" />
        {isTeacher && onUpload && (
          <button type="button" className="rounded-[8px] bg-[#2584FF] px-4 py-1.5 text-xs font-medium text-white hover:bg-[#1a6fe0]" onClick={onUpload}>
            上传试卷
          </button>
        )}
        {onOpenBasket && (
          <button type="button" className="rounded-[8px] border border-[#2584FF]/30 bg-[#2584FF]/10 px-3 py-1.5 text-xs text-[#5C9DFF]" onClick={onOpenBasket}>
            资源篮 {basketCount > 0 ? `(${basketCount})` : ''}
          </button>
        )}
        <LinkSync href={syncHref} />
      </div>
    </div>
  )
}

function LinkSync({ href }: { href?: string }) {
  if (!href) return null
  return (
    <a href={href} className="text-xs text-[#5C9DFF] hover:underline whitespace-nowrap">
      去找同步试卷 →
    </a>
  )
}
