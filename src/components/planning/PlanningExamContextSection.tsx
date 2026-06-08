import type { EnhancedPlanningFormData } from '../../types/planning'
import {
  ACADEMIC_TERMS,
  getProvinceExamProfile,
  ZHEJIANG_ELECTIVE_SUBJECTS,
} from '../../data/provinceExamProfiles'
import { examTypeFromGrade } from '../../lib/examDataApi'

const sectionTitleClass = 'flex items-center gap-2 text-sm font-semibold text-[#E8ECF3]'
const sectionDescClass = 'text-xs text-[#6B7588]'
const labelClass = 'mb-1.5 block text-sm font-medium text-[#B0B9C8]'
const selectClass =
  'w-full rounded-xl border border-[#2A3444] bg-[#151C28] px-4 py-2.5 text-sm text-[#E8ECF3] outline-none transition focus:border-[#2584FF] focus:ring-2 focus:ring-[#2584FF]/20'

interface Props {
  form: EnhancedPlanningFormData
  onChange: (form: EnhancedPlanningFormData) => void
}

export default function PlanningExamContextSection({ form, onChange }: Props) {
  const province = form.schoolInfo.province
  const profile = getProvinceExamProfile(province || 'default')
  const isGaokao = examTypeFromGrade(form.schoolInfo.grade) === '高考'
  const isZhejiang = province === '浙江'
  const electiveOptions =
    isZhejiang ? ZHEJIANG_ELECTIVE_SUBJECTS : (profile.electiveSubjects ?? [])

  const toggleElective = (subject: string) => {
    const has = form.electiveSubjects.includes(subject)
    let next: string[]
    if (has) {
      next = form.electiveSubjects.filter((s) => s !== subject)
    } else if (form.electiveSubjects.length >= 3) {
      return
    } else {
      next = [...form.electiveSubjects, subject]
    }
    onChange({ ...form, electiveSubjects: next })
  }

  return (
    <div className="rounded-xl border border-white/[0.04] bg-[#161D2B]/60 p-4">
      <div className="mb-3 flex flex-col gap-0.5 border-b border-white/[0.05] pb-2.5">
        <div className={sectionTitleClass}>
          <span>📅</span>
          <span>考试制度与学期</span>
        </div>
        <p className={sectionDescClass}>
          结合省份差异（如浙江首考+高考、7选3）制定可执行的升学时间线
        </p>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div>
          <label className={labelClass}>当前学期</label>
          <select
            value={form.academicTerm}
            onChange={(e) =>
              onChange({ ...form, academicTerm: e.target.value as EnhancedPlanningFormData['academicTerm'] })
            }
            className={selectClass}
          >
            {ACADEMIC_TERMS.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className={labelClass}>本省高考模式</label>
          <p className="rounded-xl border border-[#2A3444] bg-[#151C28] px-4 py-2.5 text-xs text-[#8A94A9]">
            {profile.gaokaoMode}
            {profile.electiveRule ? ` · ${profile.electiveRule}` : ''}
          </p>
        </div>
      </div>

      {isGaokao && electiveOptions.length > 0 && (
        <div className="mb-4">
          <label className={labelClass}>
            选考科目{isZhejiang ? '（浙江7选3，已选' : '（已选'}
            {form.electiveSubjects.length}/3）
          </label>
          <div className="flex flex-wrap gap-2">
            {electiveOptions.map((subj) => {
              const active = form.electiveSubjects.includes(subj)
              return (
                <button
                  key={subj}
                  type="button"
                  onClick={() => toggleElective(subj)}
                  className={`rounded-full px-3 py-1 text-xs transition ${
                    active
                      ? 'bg-[#2584FF]/25 text-[#93C5FD] ring-1 ring-[#2584FF]/40'
                      : 'bg-[#151C28] text-[#8A94A9] hover:text-[#E8ECF3]'
                  }`}
                >
                  {subj}
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div>
        <label className={labelClass}>关键时间节点（{province || '请选择省份'}）</label>
        <div className="space-y-1.5">
          {profile.timeline.slice(0, 6).map((node) => (
            <div
              key={`${node.month}-${node.event}`}
              className="flex items-start gap-2 rounded-lg bg-[#151C28] px-3 py-2 text-xs"
            >
              <span className="shrink-0 font-medium text-[#2584FF]">{node.month}</span>
              <span className="text-[#B0B9C8]">
                {node.event}
                {node.note ? <span className="text-[#6B7588]"> — {node.note}</span> : null}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
