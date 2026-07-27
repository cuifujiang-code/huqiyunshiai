import { useState, useCallback, useEffect, useMemo } from 'react'
import type {
  EnhancedPlanningFormData,
  ExamDifficulty,
  HollandScores,
  HouseholdType,
  WizardSubjectScore,
} from '../../types/planning'
import {
  PLANNING_GRADES,
  DEFAULT_HOLLAND_SCORES,
  WIZARD_MAIN_SUBJECTS,
  WIZARD_ALL_ELECTIVES,
  EXAM_DIFFICULTIES,
  HOUSEHOLD_TYPES,
  FAMILY_BUDGETS,
  PARENT_EDUCATIONS,
  IDENTITY_RESOURCES,
  SPECIAL_TALENT_TAGS,
  PRIMARY_GOALS,
  TARGET_TIER_LEVELS,
  buildDefaultWizardSubjectScores,
} from '../../types/planning'
import { buildDefaultSubjectScores } from '../../lib/examDataApi'
import {
  calcCompetencyScore,
  matchRouteLabel,
  competencyColor,
  hollandTopCareers,
  buildFiveDimensionRadar,
  syncWizardToLegacyForm,
} from '../../lib/planningWizardUtils'
import PlanningSummaryRadarChart from './PlanningSummaryRadarChart'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'

// ============================================================
// 默认表单数据
// ============================================================

export const defaultEnhancedForm: EnhancedPlanningFormData = {
  studentName: '',
  gender: '',
  birthDate: '',
  grade: '初二',
  city: '浙江金华',
  householdType: '',
  hollandScores: { ...DEFAULT_HOLLAND_SCORES },
  competencyScore: 0,
  mainSubjectScores: buildDefaultWizardSubjectScores(WIZARD_MAIN_SUBJECTS),
  electiveSubjectScores: buildDefaultWizardSubjectScores(WIZARD_ALL_ELECTIVES),
  familyBudget: '',
  parentEducation: '',
  identityResources: [],
  targetTierLevel: '',
  specialTalents: [],
  primaryGoal: '',
  targetMajorIntent: '',
  schoolInfo: {
    province: '浙江',
    city: '金华',
    district: '',
    schoolName: '',
    grade: '初二',
    className: '',
  },
  ranking: {
    classRank: null,
    classTotal: null,
    schoolRank: null,
    schoolTotal: null,
  },
  goalDirections: ['高考'],
  targetSchools: [],
  scoreLevel: '良好',
  subjectScores: buildDefaultSubjectScores('default', '初二'),
  interests: ['数学'],
  specialties: [],
  parentExpectations: '希望冲击理想院校，同时保持学习兴趣和身心健康。',
  specialNotes: '',
  academicTerm: '上学期',
  electiveSubjects: [],
  scoreHistory: [],
  createdByRole: 'teacher',
}

const WIZARD_STEPS = [
  { id: 1, title: '基本信息' },
  { id: 2, title: '学科成绩' },
  { id: 3, title: '兴趣特长' },
  { id: 4, title: '家庭资源' },
  { id: 5, title: '目标期望' },
] as const

const HOLLAND_LABELS: { key: keyof HollandScores; title: string; desc: string }[] = [
  { key: 'R', title: 'R（实用型）', desc: '喜欢动手操作、机械、户外运动' },
  { key: 'I', title: 'I（研究型）', desc: '喜欢分析、研究、解题、理科探索' },
  { key: 'A', title: 'A（艺术型）', desc: '喜欢创作、设计、音乐、文学' },
  { key: 'S', title: 'S（社会型）', desc: '喜欢帮助他人、沟通、教学、服务' },
  { key: 'E', title: 'E（企业型）', desc: '喜欢领导、组织、销售、竞争' },
  { key: 'C', title: 'C（事务型）', desc: '喜欢规范、数据、细节、有序工作' },
]

// ============================================================
// Props
// ============================================================

interface Props {
  form: EnhancedPlanningFormData
  loading: boolean
  onChange: (form: EnhancedPlanningFormData) => void
  onGenerate: (finalForm?: EnhancedPlanningFormData) => void
  showStudentName?: boolean
}

const inputClass =
  'w-full rounded-xl border border-[#2A3444] bg-[#151C28] px-4 py-2.5 text-sm text-[#E8ECF3] outline-none transition placeholder:text-[#5A6478] focus:border-[#2584FF] focus:ring-2 focus:ring-[#2584FF]/20'
const selectClass = inputClass
const labelClass = 'mb-1.5 block text-sm font-medium text-[#B0B9C8]'

// ============================================================
// 组件
// ============================================================

export default function PlanningInputPanel({
  form,
  loading,
  onChange,
  onGenerate,
  showStudentName = true,
}: Props) {
  const { user } = useAuth()
  const [step, setStep] = useState(1)
  const [stepError, setStepError] = useState<string | null>(null)

  const competencyScore = useMemo(
    () => calcCompetencyScore(form.mainSubjectScores, form.electiveSubjectScores),
    [form.mainSubjectScores, form.electiveSubjectScores],
  )

  const radarDimensions = useMemo(
    () => buildFiveDimensionRadar({ ...form, competencyScore }),
    [form, competencyScore],
  )

  const careerHints = useMemo(() => hollandTopCareers(form.hollandScores), [form.hollandScores])
  const routeLabel = matchRouteLabel(competencyScore)

  useEffect(() => {
    if (!user?.id) return
    supabase
      .from('profiles')
      .select('selected_subjects')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        const raw = data?.selected_subjects
        let list: string[] = []
        if (Array.isArray(raw)) {
          list = raw.filter((s): s is string => typeof s === 'string' && s.length > 0)
        } else if (typeof raw === 'string') {
          try {
            const parsed = JSON.parse(raw)
            if (Array.isArray(parsed)) list = parsed.filter((s) => typeof s === 'string')
          } catch {
            /* ignore */
          }
        }
        if (!list.length) return
        const electives = list.filter((s) => (WIZARD_ALL_ELECTIVES as readonly string[]).includes(s))
        if (!electives.length) return
        onChange({
          ...form,
          electiveSubjectScores: buildDefaultWizardSubjectScores(electives).map((s) => ({
            ...s,
            score: form.electiveSubjectScores.find((e) => e.subject === s.subject)?.score ?? null,
            difficulty:
              form.electiveSubjectScores.find((e) => e.subject === s.subject)?.difficulty ?? '校内月考',
          })),
        })
      })
  }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const updateForm = useCallback(
    (patch: Partial<EnhancedPlanningFormData>) => onChange({ ...form, ...patch }),
    [form, onChange],
  )

  const updateMainScore = (index: number, patch: Partial<WizardSubjectScore>) => {
    const next = [...form.mainSubjectScores]
    next[index] = { ...next[index], ...patch }
    updateForm({ mainSubjectScores: next })
  }

  const updateElectiveScore = (index: number, patch: Partial<WizardSubjectScore>) => {
    const next = [...form.electiveSubjectScores]
    next[index] = { ...next[index], ...patch }
    updateForm({ electiveSubjectScores: next })
  }

  const updateHolland = (key: keyof HollandScores, value: number) => {
    updateForm({ hollandScores: { ...form.hollandScores, [key]: value } })
  }

  const toggleTalent = (tag: string) => {
    const has = form.specialTalents.includes(tag)
    if (has) {
      updateForm({ specialTalents: form.specialTalents.filter((t) => t !== tag) })
    } else if (form.specialTalents.length < 3) {
      updateForm({ specialTalents: [...form.specialTalents, tag] })
    }
  }

  const toggleIdentity = (item: string) => {
    if (item === '以上均无') {
      updateForm({ identityResources: form.identityResources.includes(item) ? [] : [item] })
      return
    }
    const withoutNone = form.identityResources.filter((x) => x !== '以上均无')
    const next = withoutNone.includes(item)
      ? withoutNone.filter((x) => x !== item)
      : [...withoutNone, item]
    updateForm({ identityResources: next })
  }

  const validateStep = (s: number): string | null => {
    if (s === 1) {
      if (showStudentName && !form.studentName.trim()) return '请填写学生姓名'
      if (!form.grade) return '请选择当前年级'
      if (!form.city.trim()) return '请填写所在城市'
      if (!form.householdType) return '请选择户籍类型'
    }
    if (s === 4) {
      if (!form.familyBudget) return '请选择年均教育预算'
      if (!form.parentEducation) return '请选择家长最高学历'
    }
    if (s === 5) {
      if (!form.primaryGoal) return '请选择主目标'
      if (!form.targetTierLevel) return '请选择期望院校层次'
    }
    return null
  }

  const goNext = () => {
    const err = validateStep(step)
    if (err) {
      setStepError(err)
      return
    }
    setStepError(null)
    setStep((s) => Math.min(5, s + 1))
  }

  const goPrev = () => {
    setStepError(null)
    setStep((s) => Math.max(1, s - 1))
  }

  const handleSubmit = () => {
    const err = validateStep(5)
    if (err) {
      setStepError(err)
      return
    }
    setStepError(null)
    const finalForm = syncWizardToLegacyForm({
      ...form,
      competencyScore,
      targetSchools: form.targetSchools.length
        ? form.targetSchools
        : form.targetTierLevel
          ? [form.targetTierLevel]
          : [],
    })
    onChange(finalForm)
    onGenerate(finalForm)
  }

  return (
    <div className="opacity-0 animate-[fadeIn_0.5s_ease_forwards]">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-[#E8ECF3] sm:text-2xl">AI 教育规划助手</h1>
        <p className="mt-1 text-xs leading-relaxed text-[#6B7588]">
          分 5 步填写学生画像，AI 将生成专属培养路径与可执行计划
        </p>
      </div>

      <StepBar current={step} />

      <div className="mt-5 space-y-4 rounded-2xl border border-white/[0.06] bg-[#1C2332]/80 p-5 sm:p-6">
        {step === 1 && (
          <StepSection title="Step 1 — 学生基本信息" desc="姓名、年级、城市与户籍">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {showStudentName && (
                <FormField label="姓名">
                  <input
                    type="text"
                    value={form.studentName}
                    onChange={(e) => updateForm({ studentName: e.target.value })}
                    placeholder="请输入真实姓名"
                    className={inputClass}
                  />
                </FormField>
              )}
              <FormField label="当前年级">
                <select
                  value={form.grade}
                  onChange={(e) => {
                    const grade = e.target.value as EnhancedPlanningFormData['grade']
                    updateForm({
                      grade,
                      schoolInfo: { ...form.schoolInfo, grade },
                    })
                  }}
                  className={selectClass}
                >
                  {PLANNING_GRADES.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="所在城市">
                <input
                  type="text"
                  value={form.city}
                  onChange={(e) => updateForm({ city: e.target.value })}
                  placeholder="如：浙江金华"
                  className={inputClass}
                />
              </FormField>
            </div>
            <div className="mt-4">
              <span className={labelClass}>户籍类型</span>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {HOUSEHOLD_TYPES.map((t) => (
                  <RadioChip
                    key={t}
                    label={t}
                    checked={form.householdType === t}
                    onClick={() => updateForm({ householdType: t as HouseholdType })}
                  />
                ))}
              </div>
            </div>
          </StepSection>
        )}

        {step === 2 && (
          <StepSection title="Step 2 — 学科成绩" desc="主科与选科成绩及题目难度">
            <div className="flex flex-col gap-6 lg:flex-row">
              <div className="flex-1 space-y-5">
                <ScoreGroup
                  title="主科成绩"
                  scores={form.mainSubjectScores}
                  fullScore={150}
                  onUpdate={updateMainScore}
                />
                <ScoreGroup
                  title={
                    form.electiveSubjectScores.length < 6
                      ? '选科成绩（已根据档案选科）'
                      : '选科成绩（未设置选科，请手动填写）'
                  }
                  scores={form.electiveSubjectScores}
                  fullScore={100}
                  onUpdate={updateElectiveScore}
                />
              </div>
              <div className="flex shrink-0 flex-col items-center justify-center rounded-xl border border-white/[0.06] bg-[#161D2B]/60 p-5 lg:w-48">
                <p className="mb-3 text-xs font-medium text-[#8A94A9]">综合竞争力指数</p>
                <CompetencyRing score={competencyScore} />
                <p className={`mt-2 text-2xl font-bold ${competencyColor(competencyScore)}`}>
                  {competencyScore}
                </p>
                <p className="mt-1 text-[10px] text-[#5A6478]">0 – 100 分</p>
              </div>
            </div>
          </StepSection>
        )}

        {step === 3 && (
          <StepSection title="Step 3 — 兴趣特长（霍兰德测评）" desc="RIASEC 六维滑块与特长标签">
            <div className="space-y-4">
              {HOLLAND_LABELS.map(({ key, title, desc }) => (
                <div key={key}>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-sm font-medium text-[#E8ECF3]">{title}</span>
                    <span className="text-sm tabular-nums text-cyan-400">{form.hollandScores[key]}</span>
                  </div>
                  <p className="mb-2 text-[11px] text-[#6B7588]">{desc}</p>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={form.hollandScores[key]}
                    onChange={(e) => updateHolland(key, Number(e.target.value))}
                    className="h-2 w-full cursor-pointer appearance-none rounded-full bg-[#2A3444] accent-[#2584FF]"
                  />
                </div>
              ))}
            </div>
            <div className="mt-5 rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4">
              <p className="mb-2 text-xs font-semibold text-cyan-300">推荐职业方向（得分最高 2 维）</p>
              <ul className="space-y-1 text-xs text-[#B0B9C8]">
                {careerHints.map((line) => (
                  <li key={line}>· {line}</li>
                ))}
              </ul>
            </div>
            <div className="mt-5">
              <span className={labelClass}>特长标签（最多选 3 个）</span>
              <div className="flex flex-wrap gap-2">
                {SPECIAL_TALENT_TAGS.map((tag) => {
                  const selected = form.specialTalents.includes(tag)
                  const disabled = !selected && form.specialTalents.length >= 3
                  return (
                    <button
                      key={tag}
                      type="button"
                      disabled={disabled}
                      onClick={() => toggleTalent(tag)}
                      className={`rounded-lg border px-3 py-1.5 text-xs transition ${
                        selected
                          ? 'border-[#2584FF] bg-[#2584FF]/20 text-[#93C5FD]'
                          : disabled
                            ? 'cursor-not-allowed border-white/[0.04] text-[#5A6478]'
                            : 'border-[#2A3444] text-[#B0B9C8] hover:border-[#2584FF]/50'
                      }`}
                    >
                      {tag}
                    </button>
                  )
                })}
              </div>
            </div>
          </StepSection>
        )}

        {step === 4 && (
          <StepSection title="Step 4 — 家庭资源" desc="教育预算、家长学历与特殊身份">
            <div className="space-y-5">
              <div>
                <span className={labelClass}>年均教育预算</span>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {FAMILY_BUDGETS.map((b) => (
                    <RadioChip
                      key={b}
                      label={b}
                      checked={form.familyBudget === b}
                      onClick={() => updateForm({ familyBudget: b })}
                    />
                  ))}
                </div>
              </div>
              <div>
                <span className={labelClass}>家长最高学历</span>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {PARENT_EDUCATIONS.map((e) => (
                    <RadioChip
                      key={e}
                      label={e}
                      checked={form.parentEducation === e}
                      onClick={() => updateForm({ parentEducation: e })}
                    />
                  ))}
                </div>
              </div>
              <div>
                <span className={labelClass}>特殊身份资源（可多选）</span>
                <div className="flex flex-wrap gap-2">
                  {IDENTITY_RESOURCES.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => toggleIdentity(item)}
                      className={`rounded-lg border px-3 py-1.5 text-xs transition ${
                        form.identityResources.includes(item)
                          ? 'border-[#2584FF] bg-[#2584FF]/20 text-[#93C5FD]'
                          : 'border-[#2A3444] text-[#B0B9C8] hover:border-[#2584FF]/50'
                      }`}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </StepSection>
        )}

        {step === 5 && (
          <>
            <StepSection title="Step 5 — 目标期望" desc="升学主目标与院校层次">
              <div className="space-y-5">
                <div>
                  <span className={labelClass}>主目标</span>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {PRIMARY_GOALS.map((g) => (
                      <RadioChip
                        key={g}
                        label={g}
                        checked={form.primaryGoal === g}
                        onClick={() => updateForm({ primaryGoal: g })}
                      />
                    ))}
                  </div>
                </div>
                <div>
                  <span className={labelClass}>期望院校层次</span>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {TARGET_TIER_LEVELS.map((t) => (
                      <RadioChip
                        key={t}
                        label={t}
                        checked={form.targetTierLevel === t}
                        onClick={() => updateForm({ targetTierLevel: t })}
                      />
                    ))}
                  </div>
                </div>
                <FormField label="有无意向专业方向（可留空）">
                  <input
                    type="text"
                    value={form.targetMajorIntent}
                    onChange={(e) => updateForm({ targetMajorIntent: e.target.value })}
                    placeholder='如"计算机/人工智能""医学""金融"'
                    className={inputClass}
                  />
                </FormField>
              </div>
            </StepSection>

            <div className="rounded-xl border border-white/[0.08] bg-[#161D2B]/80 p-5">
              <h3 className="mb-4 text-sm font-semibold text-[#E8ECF3]">提交前汇总</h3>
              <div className="flex flex-col items-center gap-6 lg:flex-row lg:items-start">
                <PlanningSummaryRadarChart dimensions={radarDimensions} />
                <div className="flex flex-1 flex-col items-center lg:items-start">
                  <p className="text-xs text-[#8A94A9]">综合竞争力指数</p>
                  <p className={`text-5xl font-bold tabular-nums ${competencyColor(competencyScore)}`}>
                    {competencyScore}
                  </p>
                  <span className="mt-3 inline-flex rounded-full border border-blue-500/30 bg-blue-500/10 px-4 py-1.5 text-sm font-medium text-blue-200">
                    预计匹配：{routeLabel}
                  </span>
                  <div className="mt-4 w-full space-y-1 text-xs text-[#8A94A9]">
                    <p>
                      {form.studentName || '学生'} · {form.grade} · {form.city}
                    </p>
                    <p>
                      主目标：{form.primaryGoal || '—'} · 院校层次：{form.targetTierLevel || '—'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {stepError && (
          <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {stepError}
          </p>
        )}

        <div className="flex items-center justify-between gap-3 border-t border-white/[0.06] pt-4">
          <button
            type="button"
            onClick={goPrev}
            disabled={step === 1 || loading}
            className="rounded-xl border border-[#2A3444] px-5 py-2.5 text-sm text-[#B0B9C8] transition hover:border-[#2584FF]/40 disabled:cursor-not-allowed disabled:opacity-40"
          >
            上一步
          </button>
          {step < 5 ? (
            <button
              type="button"
              onClick={goNext}
              disabled={loading}
              className="rounded-xl bg-[#2584FF] px-6 py-2.5 text-sm font-medium text-white transition hover:bg-[#1a6fe0] disabled:opacity-50"
            >
              下一步
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#2584FF] to-[#06B6D4] px-6 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {loading && <LoadingSpinner size={16} />}
              生成规划报告
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ============================================================
// 子组件
// ============================================================

function StepBar({ current }: { current: number }) {
  return (
    <div className="flex items-center justify-between gap-1 sm:gap-2">
      {WIZARD_STEPS.map((s, i) => {
        const done = current > s.id
        const active = current === s.id
        return (
          <div key={s.id} className="flex flex-1 items-center">
            <div className="flex flex-col items-center gap-1 flex-1 min-w-0">
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition ${
                  done
                    ? 'bg-green-500/20 text-green-400 ring-1 ring-green-500/40'
                    : active
                      ? 'bg-[#2584FF] text-white ring-2 ring-[#2584FF]/40'
                      : 'bg-[#2A3444] text-[#6B7588]'
                }`}
              >
                {done ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  s.id
                )}
              </div>
              <span
                className={`hidden truncate text-[10px] sm:block ${active ? 'text-[#E8ECF3]' : 'text-[#6B7588]'}`}
              >
                Step {s.id}/5 · {s.title}
              </span>
            </div>
            {i < WIZARD_STEPS.length - 1 && (
              <div
                className={`mx-1 h-0.5 flex-1 rounded ${done ? 'bg-green-500/40' : 'bg-[#2A3444]'}`}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

function StepSection({
  title,
  desc,
  children,
}: {
  title: string
  desc?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="mb-4 border-b border-white/[0.05] pb-3">
        <h2 className="text-sm font-semibold text-[#E8ECF3]">{title}</h2>
        {desc && <p className="mt-0.5 text-xs text-[#6B7588]">{desc}</p>}
      </div>
      {children}
    </div>
  )
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className={labelClass}>{label}</label>
      {children}
    </div>
  )
}

function RadioChip({
  label,
  checked,
  onClick,
}: {
  label: string
  checked: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border px-3 py-2.5 text-left text-xs transition sm:text-sm ${
        checked
          ? 'border-[#2584FF] bg-[#2584FF]/15 text-[#93C5FD]'
          : 'border-[#2A3444] text-[#B0B9C8] hover:border-[#2584FF]/40'
      }`}
    >
      {label}
    </button>
  )
}

function ScoreGroup({
  title,
  scores,
  fullScore,
  onUpdate,
}: {
  title: string
  scores: WizardSubjectScore[]
  fullScore: number
  onUpdate: (index: number, patch: Partial<WizardSubjectScore>) => void
}) {
  return (
    <div>
      <h3 className="mb-3 text-xs font-semibold text-[#8A94A9]">{title}</h3>
      <div className="space-y-2">
        {scores.map((s, i) => (
          <div key={s.subject} className="grid grid-cols-[4rem_1fr_7rem] items-center gap-2 sm:grid-cols-[5rem_1fr_8rem]">
            <span className="text-sm text-[#E8ECF3]">{s.subject}</span>
            <input
              type="number"
              min={0}
              max={fullScore}
              value={s.score ?? ''}
              onChange={(e) =>
                onUpdate(i, {
                  score: e.target.value === '' ? null : Math.min(fullScore, Math.max(0, Number(e.target.value))),
                })
              }
              placeholder={`/${fullScore}`}
              className={inputClass + ' py-2'}
            />
            <select
              value={s.difficulty}
              onChange={(e) => onUpdate(i, { difficulty: e.target.value as ExamDifficulty })}
              className={selectClass + ' py-2 text-xs'}
            >
              {EXAM_DIFFICULTIES.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </div>
  )
}

function CompetencyRing({ score }: { score: number }) {
  const r = 52
  const c = 2 * Math.PI * r
  const offset = c - (score / 100) * c
  return (
    <svg width="130" height="130" viewBox="0 0 130 130" className="-rotate-90">
      <circle cx="65" cy="65" r={r} stroke="#2A3444" strokeWidth="10" fill="none" />
      <circle
        cx="65"
        cy="65"
        r={r}
        stroke="url(#compGrad)"
        strokeWidth="10"
        fill="none"
        strokeDasharray={c}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className="transition-all duration-500"
      />
      <defs>
        <linearGradient id="compGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#2584FF" />
          <stop offset="100%" stopColor="#06B6D4" />
        </linearGradient>
      </defs>
    </svg>
  )
}

function LoadingSpinner({ size = 16 }: { size?: number }) {
  return (
    <svg className="animate-spin" width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="opacity-30" />
      <path d="M12 2a10 10 0 019.95 9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}
