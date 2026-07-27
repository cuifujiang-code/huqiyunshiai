import type { PlanningFormData, PlanningReport } from '../types/planning'
import { computeFiveDimensionAnalysis } from '../lib/planningWizardUtils'

/** 客户端本地 mock（与 server/mockPlanningData 逻辑对齐的简化版） */
export function buildLocalPlanningReport(form: PlanningFormData): PlanningReport {
  const goals = form.goalDirections.length ? form.goalDirections : (['中考'] as const)
  const primaryGoal = goals[0]

  const abilityBase =
    form.scoreLevel === '优秀' ? 85 : form.scoreLevel === '良好' ? 72 : form.scoreLevel === '中等' ? 60 : 48

  const fiveDim = computeFiveDimensionAnalysis(form)

  return {
    title: `${form.studentName} · ${form.grade} · 个性化教育规划方案`,
    generatedAt: new Date().toISOString(),
    studentProfile: {
      name: form.studentName,
      grade: form.grade,
      scoreLevel: form.scoreLevel,
      goalDirections: [...goals],
      interests: [...form.interests],
      parentExpectations: form.parentExpectations || '未填写',
      specialNotes: form.specialNotes || '无',
    },
    abilityDimensions: [
      { label: '逻辑思维', score: Math.min(100, abilityBase + 5) },
      { label: '语言表达', score: Math.min(100, abilityBase) },
      { label: '数理能力', score: Math.min(100, abilityBase + 8) },
      { label: '创新能力', score: Math.min(100, abilityBase + 3) },
      { label: '应试技巧', score: Math.min(100, abilityBase - 5) },
      { label: '自主学习', score: Math.min(100, abilityBase) },
    ],
    stageGoals: [
      {
        period: `${form.grade}上学期`,
        phase: '夯实基础',
        coreTasks: ['梳理核心知识点', '建立错题本', '固定每日学习时段'],
        expectedOutcomes: ['主科成绩稳定提升', '形成良好学习习惯'],
      },
      {
        period: `${form.grade}下学期`,
        phase: '提升难度',
        coreTasks: ['中等难度综合题训练', '薄弱学科专项突破', '模拟测评'],
        expectedOutcomes: ['综合题得分率提升', '薄弱学科明显改善'],
      },
      {
        period: '升学关键期',
        phase: primaryGoal === '高考' ? '高考冲刺' : '中考冲刺',
        coreTasks: ['套卷限时训练', '考纲分模块复习', '志愿规划准备'],
        expectedOutcomes: ['达成目标升学方向预期成果'],
      },
    ],
    subjectPaths: [
      {
        subject: '数学',
        importance: 5,
        timePercent: 25,
        keyKnowledgePoints: ['函数', '几何', '方程'],
        resourceTypes: ['同步练习', '专题突破', '模拟试卷'],
      },
      {
        subject: '语文',
        importance: 4,
        timePercent: 20,
        keyKnowledgePoints: ['阅读', '写作', '古诗文'],
        resourceTypes: ['阅读训练', '作文素材'],
      },
      {
        subject: '英语',
        importance: 4,
        timePercent: 20,
        keyKnowledgePoints: ['词汇', '阅读', '写作'],
        resourceTypes: ['词汇手册', '真题套卷'],
      },
      {
        subject: '物理',
        importance: 4,
        timePercent: 20,
        keyKnowledgePoints: ['力学', '电学', '实验'],
        resourceTypes: ['实验视频', '同步题集'],
      },
    ],
    phaseTasks: [
      {
        phase: `${form.grade} · 第一学期`,
        tasks: [
          {
            name: '知识点清单梳理',
            criteria: '完成主科知识清单标注',
            duration: '2周',
            knowledgePoints: ['本学期核心考点'],
            relatedExercises: ['同步练习册', '基础巩固卷'],
          },
          {
            name: '周测错题复盘',
            criteria: '每周错题100%复盘',
            duration: '持续整学期',
            knowledgePoints: ['个人薄弱点'],
            relatedExercises: ['错题同类题', '周测卷'],
          },
        ],
      },
    ],
    milestones: [
      { date: '10月', event: '模拟考试', preparationAdvice: '诊断薄弱模块，调整复习计划' },
      { date: '3月', event: '升学报名', preparationAdvice: '核对政策与材料' },
      { date: '4-5月', event: '一模/二模', preparationAdvice: '限时套卷，关注排名变化' },
      { date: '6月', event: '正式考试与志愿填报', preparationAdvice: '稳定作息，志愿梯度填报' },
    ],
    risks: [
      {
        risk: '基础薄弱可能影响后续难度提升',
        impact: '高',
        mitigation: '先补基础再攻难题；每日固定基础训练30分钟',
      },
      {
        risk: '多目标并行可能导致精力分散',
        impact: '中',
        mitigation: '确定主目标与备选目标，阶段性复盘调整',
      },
    ],
    pathOptions: [
      {
        name: fiveDim.totalScore >= 85 ? '985冲刺路线' : fiveDim.totalScore >= 70 ? '211/双一流路线' : '省内重本路线',
        matchScore: Math.min(95, fiveDim.totalScore + 5),
        reason: '与当前五维总分及成绩水平最匹配的主路径',
        keyActions: ['锁定主科提分计划', '按目标优化选科组合', '每月模考校准进度'],
      },
      {
        name: '综合评价备选路线',
        matchScore: Math.max(55, fiveDim.totalScore - 5),
        reason: '兼顾兴趣特长与录取概率的备选方案',
        keyActions: ['积累综合素质材料', '关注专项招生窗口', '保持主科稳定'],
      },
      {
        name: '省内公办保底路线',
        matchScore: Math.max(40, fiveDim.totalScore - 15),
        reason: '确保有学可上的保底路径',
        keyActions: ['夯实基础题得分率', '了解高职单招政策', '设定最低可接受院校'],
      },
    ],
    source: 'mock',
  }
}
