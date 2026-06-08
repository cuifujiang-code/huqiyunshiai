import type { UniversityLookupResult } from '../../types/planning'

interface Props {
  lookup: UniversityLookupResult
  targetMajor: string
  onMajorChange: (major: string) => void
  onConfirm: () => void
  onCancel: () => void
  loading?: boolean
}

export default function PlanningUniversityConfirmModal({
  lookup,
  targetMajor,
  onMajorChange,
  onConfirm,
  onCancel,
  loading = false,
}: Props) {
  if (!lookup.matched) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
        <div className="max-w-md rounded-2xl border border-red-500/30 bg-[#1C2332] p-6 shadow-xl">
          <h3 className="mb-2 text-lg font-semibold text-red-400">暂无权威录取数据</h3>
          <p className="mb-4 text-sm leading-relaxed text-[#B0B9C8]">
            {lookup.message || '知识库中未找到匹配的院校数据，系统禁止 AI 自行编造分数线。'}
          </p>
          <button
            type="button"
            onClick={onCancel}
            className="w-full rounded-xl bg-[#2A3444] py-2.5 text-sm text-[#E8ECF3] hover:bg-[#343f52]"
          >
            返回修改
          </button>
        </div>
      </div>
    )
  }

  const adm = lookup.admission

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-w-lg rounded-2xl border border-[#2584FF]/30 bg-[#1C2332] p-6 shadow-xl">
        <h3 className="mb-1 text-lg font-semibold text-[#E8ECF3]">确认目标院校录取数据</h3>
        <p className="mb-4 text-xs text-[#6B7588]">
          以下数据来自知识库，AI 将严格基于此生成规划并引用来源
        </p>

        <div className="mb-4 space-y-2 rounded-xl bg-[#151C28] p-4 text-sm">
          <div className="flex justify-between">
            <span className="text-[#8A94A9]">目标院校</span>
            <span className="font-medium text-[#E8ECF3]">{lookup.university}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#8A94A9]">省份</span>
            <span className="text-[#E8ECF3]">{lookup.province}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#8A94A9]">数据年份</span>
            <span className="text-[#E8ECF3]">{lookup.year}年</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#8A94A9]">最低录取分</span>
            <span className="font-semibold text-green-400">{adm?.min_score ?? '—'} 分</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#8A94A9]">最低位次</span>
            <span className="font-semibold text-green-400">
              {adm?.min_rank != null ? adm.min_rank.toLocaleString() : '—'}
            </span>
          </div>
          {adm?.elective_requirement && (
            <div className="flex justify-between">
              <span className="text-[#8A94A9]">选科要求</span>
              <span className="text-[#E8ECF3]">{adm.elective_requirement}</span>
            </div>
          )}
        </div>

        <div className="mb-4">
          <label className="mb-1 block text-xs text-[#8A94A9]">目标专业（知识库键名）</label>
          <input
            type="text"
            value={targetMajor}
            onChange={(e) => onMajorChange(e.target.value)}
            className="w-full rounded-xl border border-[#2A3444] bg-[#151C28] px-3 py-2 text-sm text-[#E8ECF3]"
            placeholder="如：计算机科学与技术，或 通用"
          />
          <p className="mt-1 text-[10px] text-[#6B7588]">当前匹配专业：{lookup.major}</p>
        </div>

        {lookup.citation && (
          <p className="mb-4 rounded-lg border border-green-500/20 bg-green-500/5 px-3 py-2 text-[10px] text-green-300/90">
            {lookup.citation}
          </p>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="flex-1 rounded-xl border border-[#2A3444] py-2.5 text-sm text-[#B0B9C8] hover:bg-[#151C28] disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 rounded-xl bg-[#2584FF] py-2.5 text-sm font-medium text-white hover:bg-[#1a6fe8] disabled:opacity-50"
          >
            {loading ? '生成中…' : '确认并生成规划'}
          </button>
        </div>
      </div>
    </div>
  )
}
