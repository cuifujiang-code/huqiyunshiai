import { useState, useCallback } from 'react'
import type {
  EnhancedPlanningFormData,
  StudentSchoolInfo,
  StudentRanking,
  SubjectScore,
  StudentSpecialty,
  GoalDirection,
  InterestTag,
  ScoreLevel,
  ExamDataReference,
} from '../../types/planning'
import {
  GOAL_DIRECTIONS,
  INTEREST_TAGS,
  PLANNING_GRADES,
  SCORE_LEVELS,
} from '../../types/planning'
import { fetchExamData, getSupportedProvinces, getCitiesByProvince } from '../../lib/examDataApi'

// ============================================================
// 默认表单数据
// ============================================================

const defaultSubjectScores: SubjectScore[] = [
  { subject: '语文', score: null, fullScore: 150, classRank: null, schoolRank: null, scoreTrend: 'stable' },
  { subject: '数学', score: null, fullScore: 150, classRank: null, schoolRank: null, scoreTrend: 'stable' },
  { subject: '英语', score: null, fullScore: 150, classRank: null, schoolRank: null, scoreTrend: 'stable' },
  { subject: '物理', score: null, fullScore: 100, classRank: null, schoolRank: null, scoreTrend: 'stable' },
  { subject: '化学', score: null, fullScore: 100, classRank: null, schoolRank: null, scoreTrend: 'stable' },
  { subject: '生物', score: null, fullScore: 100, classRank: null, schoolRank: null, scoreTrend: 'stable' },
  { subject: '历史', score: null, fullScore: 100, classRank: null, schoolRank: null, scoreTrend: 'stable' },
  { subject: '地理', score: null, fullScore: 100, classRank: null, schoolRank: null, scoreTrend: 'stable' },
  { subject: '政治', score: null, fullScore: 100, classRank: null, schoolRank: null, scoreTrend: 'stable' },
]

export const defaultEnhancedForm: EnhancedPlanningFormData = {
  studentName: '',
  gender: '',
  birthDate: '',
  schoolInfo: {
    province: '',
    city: '',
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
  goalDirections: ['中考'],
  targetSchools: [],
  scoreLevel: '良好',
  subjectScores: defaultSubjectScores,
  interests: ['数学', '物理'],
  specialties: [],
  parentExpectations: '希望冲击重点高中，同时保持学习兴趣和身心健康。',
  specialNotes: '',
  createdByRole: 'teacher',
}

// ============================================================
// Props
// ============================================================

interface Props {
  form: EnhancedPlanningFormData
  loading: boolean
  onChange: (form: EnhancedPlanningFormData) => void
  onGenerate: () => void
  showStudentName?: boolean
}

// ============================================================
// 样式常量
// ============================================================

const inputClass =
  'w-full rounded-xl border border-[#2A3444] bg-[#151C28] px-4 py-2.5 text-sm text-[#E8ECF3] outline-none transition placeholder:text-[#5A6478] focus:border-[#2584FF] focus:ring-2 focus:ring-[#2584FF]/20'
const selectClass = inputClass
const labelClass = 'mb-1.5 block text-sm font-medium text-[#B0B9C8]'
const sectionTitleClass = 'flex items-center gap-2 text-sm font-semibold text-[#E8ECF3]'
const sectionDescClass = 'text-xs text-[#6B7588]'

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
  // 考试数据加载状态
  const [examLoading, setExamLoading] = useState(false)
  const [examMessage, setExamMessage] = useState<string | null>(null)

  // ---- 更新 helpers ----

  const updateForm = useCallback(
    (patch: Partial<EnhancedPlanningFormData>) => {
      onChange({ ...form, ...patch })
    },
    [form, onChange]
  )

  const updateSchoolInfo = useCallback(
    (patch: Partial<StudentSchoolInfo>) => {
      onChange({ ...form, schoolInfo: { ...form.schoolInfo, ...patch } })
    },
    [form, onChange]
  )

  const updateRanking = useCallback(
    (patch: Partial<StudentRanking>) => {
      onChange({ ...form, ranking: { ...form.ranking, ...patch } })
    },
    [form, onChange]
  )

  // ---- 目标方向切换 ----

  const toggleGoal = (goal: GoalDirection) => {
    const next = form.goalDirections.includes(goal)
      ? form.goalDirections.filter((g) => g !== goal)
      : [...form.goalDirections, goal]
    updateForm({ goalDirections: next })
  }

  // ---- 兴趣标签切换 ----

  const toggleInterest = (tag: InterestTag) => {
    const next = form.interests.includes(tag)
      ? form.interests.filter((t) => t !== tag)
      : [...form.interests, tag]
    updateForm({ interests: next })
  }

  // ---- 各科成绩更新 ----

  const updateSubjectScore = (index: number, patch: Partial<SubjectScore>) => {
    const next = [...form.subjectScores]
    next[index] = { ...next[index], ...patch }
    updateForm({ subjectScores: next })
  }

  // ---- 目标学校管理 ----

  const addTargetSchool = () => {
    const val = prompt('请输入目标学校名称：')
    if (val?.trim()) {
      updateForm({ targetSchools: [...form.targetSchools, val.trim()] })
    }
  }

  const removeTargetSchool = (idx: number) => {
    updateForm({ targetSchools: form.targetSchools.filter((_, i) => i !== idx) })
  }

  // ---- 特长管理 ----

  const addSpecialty = () => {
    const newSp: StudentSpecialty = {
      type: 'other',
      name: '',
      level: '',
      yearsOfExperience: 0,
      description: '',
    }
    updateForm({ specialties: [...form.specialties, newSp] })
  }

  const updateSpecialty = (index: number, patch: Partial<StudentSpecialty>) => {
    const next = [...form.specialties]
    next[index] = { ...next[index], ...patch }
    updateForm({ specialties: next })
  }

  const removeSpecialty = (index: number) => {
    updateForm({ specialties: form.specialties.filter((_, i) => i !== index) })
  }

  // ---- 省份联动 ----

  const provinceOptions = getSupportedProvinces()
  const cityOptions = getCitiesByProvince(form.schoolInfo.province)

  // 当省份变化时清空城市
  const handleProvinceChange = (province: string) => {
    updateSchoolInfo({ province, city: '', district: '' })
  }

  // ---- AI 获取考试数据 ----

  const handleFetchExamData = async () => {
    if (!form.schoolInfo.province || !form.schoolInfo.city) {
      setExamMessage('请先选择省份和城市')
      return
    }
    setExamLoading(true)
    setExamMessage(null)
    try {
      // 根据年级判断考试类型
      const isHighSchool = ['高一', '高二', '高三'].includes(form.schoolInfo.grade)
      const examType: '中考' | '高考' = isHighSchool ? '高考' : '中考'

      const result = await fetchExamData({
        province: form.schoolInfo.province,
        city: form.schoolInfo.city,
        examType,
      })

      if (result.success && result.data) {
        updateForm({ examDataRef: result.data })
        setExamMessage(`已获取 ${result.data.province}${result.data.city}${examType}参考数据`)
      } else {
        setExamMessage(result.message ?? '获取失败')
      }
    } catch {
      setExamMessage('获取考试数据时出错')
    } finally {
      setExamLoading(false)
    }
  }

  // ---- 提交校验 ----

  const canSubmit = showStudentName ? !!form.studentName.trim() : true

  // ============================================================
  // 渲染
  // ============================================================

  return (
    <div className="opacity-0 animate-[fadeIn_0.5s_ease_forwards]">
      {/* 标题 */}
      <div className="mb-5">
        <h1 className="text-xl font-bold text-[#E8ECF3] sm:text-2xl">AI 教育规划助手</h1>
        <p className="mt-1 text-xs leading-relaxed text-[#6B7588]">
          填写学生详细画像，AI 将生成专属培养路径与可执行计划
        </p>
      </div>

      <div className="space-y-4 rounded-2xl border border-white/[0.06] bg-[#1C2332]/80 p-5 sm:p-6">

        {/* ===== Section 1: 基本信息 ===== */}
        <SectionBlock title="基本信息" icon="📋" desc="姓名、性别、出生日期">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {showStudentName && (
              <FormField label="学生姓名" smSpan={false}>
                <input
                  type="text"
                  value={form.studentName}
                  onChange={(e) => updateForm({ studentName: e.target.value })}
                  placeholder="请输入真实姓名"
                  className={inputClass}
                />
              </FormField>
            )}
            <FormField label="性别">
              <select
                value={form.gender}
                onChange={(e) =>
                  updateForm({ gender: e.target.value as '男' | '女' | '' })
                }
                className={selectClass}
              >
                <option value="">请选择</option>
                <option value="男">男</option>
                <option value="女">女</option>
              </select>
            </FormField>
            <FormField label="出生日期">
              <input
                type="date"
                value={form.birthDate}
                onChange={(e) => updateForm({ birthDate: e.target.value })}
                className={inputClass}
              />
            </FormField>
          </div>
        </SectionBlock>

        {/* ===== Section 2: 学校信息 ===== */}
        <SectionBlock title="学校信息" icon="🏫" desc="省市区、学校、年级班级（级联选择）">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <FormField label="省份">
              <select
                value={form.schoolInfo.province}
                onChange={(e) => handleProvinceChange(e.target.value)}
                className={selectClass}
              >
                <option value="">选择省/直辖市</option>
                {provinceOptions.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </FormField>
            <FormField label="地级市">
              <select
                value={form.schoolInfo.city}
                onChange={(e) => updateSchoolInfo({ city: e.target.value })}
                className={selectClass}
                disabled={!form.schoolInfo.province}
              >
                <option value="">选择城市</option>
                {cityOptions.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </FormField>
            <FormField label="区/县">
              <input
                type="text"
                value={form.schoolInfo.district}
                onChange={(e) => updateSchoolInfo({ district: e.target.value })}
                placeholder="如：西湖区"
                className={inputClass}
              />
            </FormField>
            <FormField label="学校名称">
              <input
                type="text"
                value={form.schoolInfo.schoolName}
                onChange={(e) => updateSchoolInfo({ schoolName: e.target.value })}
                placeholder="如：杭州第二中学"
                className={inputClass}
              />
            </FormField>
            <FormField label="年级">
              <select
                value={form.schoolInfo.grade}
                onChange={(e) => updateSchoolInfo({ grade: e.target.value })}
                className={selectClass}
              >
                {PLANNING_GRADES.map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </FormField>
            <FormField label="班级">
              <input
                type="text"
                value={form.schoolInfo.className}
                onChange={(e) => updateSchoolInfo({ className: e.target.value })}
                placeholder="如：3班"
                className={inputClass}
              />
            </FormField>
          </div>
        </SectionBlock>

        {/* ===== Section 3: 成绩排名 ===== */}
        <SectionBlock title="成绩排名" icon="📊" desc="当前在校/班级排名及各科成绩详情">
          {/* 排名信息 */}
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <FormField label="班级排名">
              <input
                type="number"
                min={1}
                value={form.ranking.classRank ?? ''}
                onChange={(e) =>
                  updateRanking({
                    classRank: e.target.value ? Number(e.target.value) : null,
                  })
                }
                placeholder="如：15"
                className={inputClass}
              />
            </FormField>
            <FormField label="班级总人数">
              <input
                type="number"
                min={1}
                value={form.ranking.classTotal ?? ''}
                onChange={(e) =>
                  updateRanking({
                    classTotal: e.target.value ? Number(e.target.value) : null,
                  })
                }
                placeholder="如：50"
                className={inputClass}
              />
            </FormField>
            <FormField label="年级排名">
              <input
                type="number"
                min={1}
                value={form.ranking.schoolRank ?? ''}
                onChange={(e) =>
                  updateRanking({
                    schoolRank: e.target.value ? Number(e.target.value) : null,
                  })
                }
                placeholder="如：200"
                className={inputClass}
              />
            </FormField>
            <FormField label="年级总人数">
              <input
                type="number"
                min={1}
                value={form.ranking.schoolTotal ?? ''}
                onChange={(e) =>
                  updateRanking({
                    schoolTotal: e.target.value ? Number(e.target.value) : null,
                  })
                }
                placeholder="如：600"
                className={inputClass}
              />
            </FormField>
          </div>

          {/* 各科成绩表格 */}
          <div className="overflow-x-auto rounded-xl border border-white/[0.05] bg-[#151C28]">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/[0.06] text-left text-[#6B7588]">
                  <th className="px-3 py-2 font-medium">科目</th>
                  <th className="px-3 py-2 font-medium">分数</th>
                  <th className="px-3 py-2 font-medium">满分</th>
                  <th className="px-3 py-2 font-medium">班排</th>
                  <th className="px-3 py-2 font-medium">校排</th>
                  <th className="px-3 py-2 font-medium">趋势</th>
                </tr>
              </thead>
              <tbody>
                {form.subjectScores.map((subj, idx) => (
                  <tr
                    key={subj.subject}
                    className="border-b border-white/[0.03] last:border-0"
                  >
                    <td className="px-3 py-2 font-medium text-[#B0B9C8]">
                      {subj.subject}
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min={0}
                        max={subj.fullScore}
                        value={subj.score ?? ''}
                        onChange={(e) =>
                          updateSubjectScore(idx, {
                            score: e.target.value ? Number(e.target.value) : null,
                          })
                        }
                        className="w-full rounded-lg border border-[#2A3444] bg-transparent px-2 py-1 text-center text-[#E8ECF3] outline-none focus:border-[#2584FF]"
                      />
                    </td>
                    <td className="px-3 py-2 text-center text-[#6B7588]">
                      {subj.fullScore}
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min={1}
                        value={subj.classRank ?? ''}
                        onChange={(e) =>
                          updateSubjectScore(idx, {
                            classRank: e.target.value ? Number(e.target.value) : null,
                          })
                        }
                        className="w-full rounded-lg border border-[#2A3444] bg-transparent px-2 py-1 text-center text-[#E8ECF3] outline-none focus:border-[#2584FF]"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min={1}
                        value={subj.schoolRank ?? ''}
                        onChange={(e) =>
                          updateSubjectScore(idx, {
                            schoolRank: e.target.value ? Number(e.target.value) : null,
                          })
                        }
                        className="w-full rounded-lg border border-[#2A3444] bg-transparent px-2 py-1 text-center text-[#E8ECF3] outline-none focus:border-[#2584FF]"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={subj.scoreTrend}
                        onChange={(e) =>
                          updateSubjectScore(idx, {
                            scoreTrend: e.target.value as SubjectScore['scoreTrend'],
                          })
                        }
                        className="w-full rounded-lg border border-[#2A3444] bg-transparent px-1 py-1 text-[#E8ECF3] outline-none focus:border-[#2584FF]"
                      >
                        <option value="stable">—</option>
                        <option value="up">&#8593; 上升</option>
                        <option value="down">&#8595; 下降</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionBlock>

        {/* ===== Section 4: 目标方向 & 目标学校 ===== */}
        <SectionBlock title="目标设定" icon="🎯" desc="升学目标方向与目标院校">
          {/* 方向多选 */}
          <div className="mb-4">
            <label className={`${labelClass}`}>目标方向（可多选）</label>
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
                        ? 'border-cyan-400/60 bg-cyan-500/20 text-cyan-300'
                        : 'border-[#2A3444] bg-[#151C28]/60 text-[#6B7588] hover:border-[#2584FF]/40 hover:text-[#B0B9C8]'
                    }`}
                  >
                    {goal}
                  </button>
                )
              })}
            </div>
          </div>

          {/* 成绩水平 */}
          <div className="mb-4">
            <label className={labelClass}>当前成绩水平</label>
            <select
              value={form.scoreLevel}
              onChange={(e) =>
                updateForm({ scoreLevel: e.target.value as ScoreLevel })
              }
              className={`max-w-[200px] ${selectClass}`}
            >
              {SCORE_LEVELS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          {/* 目标学校 */}
          <div>
            <label className={labelClass}>目标学校</label>
            <div className="mb-2 flex flex-wrap gap-2">
              {form.targetSchools.map((school, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center gap-1 rounded-full border border-[#2584FF]/30 bg-[#2584FF]/10 px-3 py-1 text-xs text-[#2584FF]"
                >
                  {school}
                  <button
                    type="button"
                    onClick={() => removeTargetSchool(idx)}
                    className="ml-0.5 text-[#2584FF]/60 hover:text-[#2584FF]"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <button
              type="button"
              onClick={addTargetSchool}
              className="rounded-lg border border-dashed border-[#2A3444] px-3 py-1.5 text-xs text-[#6B7588] transition hover:border-[#2584FF]/40 hover:text-[#2584FF]"
            >
              + 添加目标学校
            </button>
          </div>
        </SectionBlock>

        {/* ===== Section 5: 兴趣特长 ===== */}
        <SectionBlock title="兴趣与特长" icon="✨" desc="学科兴趣标签与个人特长技能">
          {/* 兴趣标签 */}
          <div className="mb-4">
            <label className={labelClass}>兴趣标签（可多选）</label>
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
                        ? 'border-[#2584FF]/60 bg-[#2584FF]/20 text-blue-200'
                        : 'border-[#2A3444] bg-[#151C28]/60 text-[#6B7588] hover:border-[#2584FF]/40 hover:text-[#B0B9C8]'
                    }`}
                  >
                    {tag}
                  </button>
                )
              })}
            </div>
          </div>

          {/* 特长列表 */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className={labelClass}>个人特长</label>
              <button
                type="button"
                onClick={addSpecialty}
                className="rounded-lg border border-dashed border-[#2A3444] px-3 py-1 text-xs text-[#6B7588] transition hover:border-[#2584FF]/40 hover:text-[#2584FF]"
              >
                + 添加特长
              </button>
            </div>

            {form.specialties.length === 0 ? (
              <p className="rounded-xl border border-dashed border-[#2A3444] p-3 text-center text-xs text-[#5A6478]">
                暂无特长记录，点击上方按钮添加
              </p>
            ) : (
              <div className="space-y-3">
                {form.specialties.map((sp, idx) => (
                  <div
                    key={idx}
                    className="rounded-xl border border-white/[0.05] bg-[#151C28] p-3"
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-medium text-[#B0B9C8]">
                        特长 #{idx + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeSpecialty(idx)}
                        className="rounded px-2 py-0.5 text-xs text-[#EF4444]/70 transition hover:bg-[#EF4444]/10 hover:text-[#EF4444]"
                      >
                        删除
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <div>
                        <label className="mb-1 block text-[11px] text-[#6B7588]">类型</label>
                        <select
                          value={sp.type}
                          onChange={(e) =>
                            updateSpecialty(idx, {
                              type: e.target.value as StudentSpecialty['type'],
                            })
                          }
                          className={`${selectClass} text-xs`}
                        >
                          <option value="art">艺术</option>
                          <option value="music">音乐</option>
                          <option value="sports">体育</option>
                          <option value="technology">科技</option>
                          <option value="literature">文学</option>
                          <option value="other">其他</option>
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-[11px] text-[#6B7588]">名称</label>
                        <input
                          type="text"
                          value={sp.name}
                          onChange={(e) =>
                            updateSpecialty(idx, { name: e.target.value })
                          }
                          placeholder="如：钢琴十级"
                          className={`${inputClass} text-xs`}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[11px] text-[#6B7588]">等级</label>
                        <input
                          type="text"
                          value={sp.level}
                          onChange={(e) =>
                            updateSpecialty(idx, { level: e.target.value })
                          }
                          placeholder="如：省级一等奖"
                          className={`${inputClass} text-xs`}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[11px] text-[#6B7588]">学习年限</label>
                        <input
                          type="number"
                          min={0}
                          value={sp.yearsOfExperience || ''}
                          onChange={(e) =>
                            updateSpecialty(idx, {
                              yearsOfExperience: e.target.value
                                ? Number(e.target.value)
                                : 0,
                            })
                          }
                          className={`${inputClass} text-xs`}
                        />
                      </div>
                    </div>
                    <div className="mt-2">
                      <label className="mb-1 block text-[11px] text-[#6B7588]">
                        详细描述
                      </label>
                      <input
                        type="text"
                        value={sp.description}
                        onChange={(e) =>
                          updateSpecialty(idx, { description: e.target.value })
                        }
                        placeholder="简要描述相关经历和成就"
                        className={`${inputClass} text-xs`}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </SectionBlock>

        {/* ===== Section 6: 家长期望 & 备注 ===== */}
        <SectionBlock title="家长期望与备注" icon="💬" desc="家长的期望描述和学生的特殊情况">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={labelClass}>家长期望描述</label>
              <textarea
                value={form.parentExpectations}
                onChange={(e) =>
                  updateForm({ parentExpectations: e.target.value })
                }
                rows={3}
                placeholder="例如：希望冲击重点高中，同时保持身心健康..."
                className={`${inputClass} resize-none`}
              />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass}>特殊需求备注</label>
              <textarea
                value={form.specialNotes}
                onChange={(e) => updateForm({ specialNotes: e.target.value })}
                rows={2}
                placeholder="例如：近期数学成绩波动较大，需要加强几何模块..."
                className={`${inputClass} resize-none`}
              />
            </div>
          </div>
        </SectionBlock>

        {/* ===== Section 7: AI 考试数据 ===== */}
        <SectionBlock
          title="AI 考试数据"
          icon="📈"
          desc="一键获取当地中高考参考数据（分数线、重点学校录取分等）"
        >
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={handleFetchExamData}
              disabled={examLoading || !form.schoolInfo.province || !form.schoolInfo.city}
              className="inline-flex w-fit items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600/80 to-purple-600/80 px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-indigo-500/20 transition hover:from-indigo-500 hover:to-purple-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {examLoading ? (
                <>
                  <LoadingSpinner size={14} />
                  正在获取数据...
                </>
              ) : (
                <>获取{['高一', '高二', '高三'].includes(form.schoolInfo.grade) ? '高考' : '中考'}参考数据</>
              )}
            </button>

            {examMessage && (
              <p
                className={`text-xs ${
                  examMessage.includes('已获取')
                    ? 'text-green-400'
                    : 'text-[#EF4444]'
                }`}
              >
                {examMessage}
              </p>
            )}

            {/* 已获取的考试数据展示 */}
            {form.examDataRef && (
              <div className="mt-2 overflow-x-auto rounded-xl border border-green-500/15 bg-green-500/[0.03] p-4">
                <div className="mb-3 text-xs font-semibold text-green-400">
                  {form.examDataRef.province} · {form.examDataRef.city} ·{' '}
                  {form.examDataRef.year}年{form.examDataRef.examType}参考数据
                </div>

                {/* 分数线 */}
                <div className="mb-3">
                  <div className="mb-1 text-[11px] font-medium text-[#8A94A9]">
                    参考分数线
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {form.examDataRef.subjects[0]?.cutoffLines?.map((line) => (
                      <span
                        key={line.tier}
                        className="rounded-full bg-green-500/10 px-2.5 py-1 text-xs text-green-300/90"
                      >
                        {line.tier}：<strong>{line.score}</strong> 分
                      </span>
                    ))}
                  </div>
                </div>

                {/* 重点学校 */}
                <div>
                  <div className="mb-1 text-[11px] font-medium text-[#8A94A9]">
                    重点学校参考录取分
                  </div>
                  <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                    {form.examDataRef.keySchools.slice(0, 5).map((school) => (
                      <div
                        key={school.name}
                        className="flex items-center justify-between rounded-lg bg-[#151C28] px-3 py-1.5"
                      >
                        <span className="text-xs text-[#B0B9C8]">{school.name}</span>
                        <span className="text-xs font-medium text-green-400">
                          ≥ {school.minScore}分
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <p className="mt-2 text-[10px] text-[#5A6478]">
                  数据来源：{form.examDataRef.source}
                </p>
              </div>
            )}
          </div>
        </SectionBlock>

        {/* ===== 提交按钮 ===== */}
        <button
          type="button"
          onClick={onGenerate}
          disabled={loading || !canSubmit}
          className="w-full rounded-xl bg-gradient-to-r from-[#2584FF] to-[#0EA5E9] py-3.5 text-sm font-semibold text-white shadow-lg shadow-[#2584FF]/25 transition hover:from-[#1a6fe8] hover:to-[#0b92d4] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? '正在生成规划方案...' : '生成教育规划方案'}
        </button>
      </div>
    </div>
  )
}

// ============================================================
// 子组件
// ============================================================

function SectionBlock({
  title,
  icon,
  desc,
  children,
}: {
  title: string
  icon: string
  desc?: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-white/[0.04] bg-[#161D2B]/60 p-4">
      <div className="mb-3 flex flex-col gap-0.5 border-b border-white/[0.05] pb-2.5">
        <div className={sectionTitleClass}>
          <span>{icon}</span>
          <span>{title}</span>
        </div>
        {desc && <p className={sectionDescClass}>{desc}</p>}
      </div>
      {children}
    </div>
  )
}

function FormField({
  label,
  children,
  smSpan,
}: {
  label: string
  children: React.ReactNode
  smSpan?: boolean
}) {
  return (
    <div className={smSpan ? 'sm:col-span-2' : ''}>
      <label className={labelClass}>{label}</label>
      {children}
    </div>
  )
}

function LoadingSpinner({ size = 16 }: { size?: number }) {
  return (
    <svg
      className="animate-spin"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        className="opacity-30"
      />
      <path
        d="M12 2a10 10 0 019.95 9"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  )
}
