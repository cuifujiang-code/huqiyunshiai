import type { PlanningFormData, GoalDirection, InterestTag, PlanningGrade, ScoreLevel } from '../../types/planning'
import {
  GOAL_DIRECTIONS,
  INTEREST_TAGS,
  PLANNING_GRADES,
  SCORE_LEVELS,
} from '../../types/planning'

interface Props {
  form: PlanningFormData
  loading: boolean
  onChange: (form: PlanningFormData) => void
  onGenerate: () => void
  showStudentName?: boolean
}

const inputClass =
  'w-full rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-3 text-white outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30'

export default function PlanningInputPanel({
  form,
  loading,
  onChange,
  onGenerate,
  showStudentName = true,
}: Props) {
  const update = <K extends keyof PlanningFormData>(key: K, value: PlanningFormData[K]) => {
    onChange({ ...form, [key]: value })
  }

  const toggleGoal = (goal: GoalDirection) => {
    const next = form.goalDirections.includes(goal)
      ? form.goalDirections.filter((g) => g !== goal)
      : [...form.goalDirections, goal]
    update('goalDirections', next)
  }

  const toggleInterest = (tag: InterestTag) => {
    const next = form.interests.includes(tag)
      ? form.interests.filter((t) => t !== tag)
      : [...form.interests, tag]
    update('interests', next)
  }

  return (
    <div className="opacity-0 animate-[fadeIn_0.5s_ease_forwards]">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-blue-100 sm:text-2xl">AI教育规划助手</h1>
        <p className="mt-1 text-sm text-slate-400">填写学生画像，AI 将生成专属培养路径与可执行计划</p>
      </div>

      <div className="space-y-4 rounded-2xl border border-blue-500/20 bg-slate-900/60 p-5 sm:p-6">
        {showStudentName && (
          <div>
            <label className="mb-1.5 block text-sm text-slate-300">学生姓名</label>
            <input
              type="text"
              value={form.studentName}
              onChange={(e) => update('studentName', e.target.value)}
              placeholder="请输入学生姓名"
              className={inputClass}
            />
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm text-slate-300">当前年级</label>
            <select
              value={form.grade}
              onChange={(e) => update('grade', e.target.value as PlanningGrade)}
              className={inputClass}
            >
              {PLANNING_GRADES.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm text-slate-300">当前成绩水平</label>
            <select
              value={form.scoreLevel}
              onChange={(e) => update('scoreLevel', e.target.value as ScoreLevel)}
              className={inputClass}
            >
              {SCORE_LEVELS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="mb-2 block text-sm text-slate-300">目标方向（可多选）</label>
          <div className="flex flex-wrap gap-2">
            {GOAL_DIRECTIONS.map((goal) => {
              const active = form.goalDirections.includes(goal)
              return (
                <button
                  key={goal}
                  type="button"
                  onClick={() => toggleGoal(goal)}
                  className={`rounded-full border px-3 py-1.5 text-xs transition ${
                    active
                      ? 'border-cyan-400/60 bg-cyan-500/20 text-cyan-200'
                      : 'border-slate-600 bg-slate-800/60 text-slate-400 hover:border-blue-500/40'
                  }`}
                >
                  {goal}
                </button>
              )
            })}
          </div>
        </div>

        <div>
          <label className="mb-2 block text-sm text-slate-300">学生兴趣标签（可多选）</label>
          <div className="flex flex-wrap gap-2">
            {INTEREST_TAGS.map((tag) => {
              const active = form.interests.includes(tag)
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleInterest(tag)}
                  className={`rounded-full border px-3 py-1 text-xs transition ${
                    active
                      ? 'border-blue-400/60 bg-blue-500/20 text-blue-200'
                      : 'border-slate-600 bg-slate-800/60 text-slate-400 hover:border-blue-500/40'
                  }`}
                >
                  {tag}
                </button>
              )
            })}
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-sm text-slate-300">家长期望描述</label>
          <textarea
            value={form.parentExpectations}
            onChange={(e) => update('parentExpectations', e.target.value)}
            rows={3}
            placeholder="例如：希望冲击重点高中，同时保持身心健康..."
            className={inputClass}
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm text-slate-300">特殊需求备注</label>
          <textarea
            value={form.specialNotes}
            onChange={(e) => update('specialNotes', e.target.value)}
            rows={2}
            placeholder="例如：近期数学成绩波动较大，需要加强几何模块..."
            className={inputClass}
          />
        </div>

        <button
          type="button"
          onClick={onGenerate}
          disabled={loading || (showStudentName && !form.studentName.trim())}
          className="w-full rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 py-3.5 text-sm font-semibold text-white shadow-lg shadow-blue-600/30 transition hover:from-blue-500 hover:to-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? '正在生成规划方案…' : '生成教育规划方案'}
        </button>
      </div>
    </div>
  )
}
