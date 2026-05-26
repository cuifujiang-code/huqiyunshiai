/**
 * 服务端模拟教育规划报告（AI 降级时使用）
 */
export function buildMockPlanningReport(form) {
  const goals = form.goalDirections?.length ? form.goalDirections : ['中考']
  const primaryGoal = goals[0]
  const isJunior = ['初一', '初二', '初三'].includes(form.grade)
  const isCompetition = goals.includes('学科竞赛')

  const abilityBase =
    form.scoreLevel === '优秀' ? 85 : form.scoreLevel === '良好' ? 72 : form.scoreLevel === '中等' ? 60 : 48

  const abilityDimensions = [
    { label: '逻辑思维', score: Math.min(100, abilityBase + (form.interests?.includes('数学') ? 10 : 0)) },
    { label: '语言表达', score: Math.min(100, abilityBase + (form.interests?.includes('文学') ? 12 : -5)) },
    { label: '数理能力', score: Math.min(100, abilityBase + (form.interests?.includes('数学') || form.interests?.includes('物理') ? 8 : 0)) },
    { label: '创新能力', score: Math.min(100, abilityBase + (form.interests?.includes('编程') ? 10 : 0)) },
    { label: '应试技巧', score: Math.min(100, abilityBase + (form.scoreLevel === '优秀' ? 5 : -8)) },
    { label: '自主学习', score: Math.min(100, abilityBase) },
  ]

  const stageGoals = isJunior
    ? [
        {
          period: `${form.grade}上学期`,
          phase: '夯实基础',
          coreTasks: ['完成课内核心知识点梳理', '建立错题本与周复盘习惯', '每日固定阅读30分钟'],
          expectedOutcomes: ['主科成绩稳定在班级中上游', '形成可坚持的学习节奏'],
        },
        {
          period: `${form.grade}下学期`,
          phase: '提升难度',
          coreTasks: ['增加中等难度综合题训练', '针对薄弱学科专项突破', '参加1次模拟测评'],
          expectedOutcomes: ['薄弱学科提升1个等级', '综合题得分率提高15%'],
        },
        ...(form.grade !== '初三'
          ? [
              {
                period: '升学关键年',
                phase: '衔接备考',
                coreTasks: ['提前了解下一阶段重点', '强化核心学科深度', '调整学习方法'],
                expectedOutcomes: ['顺利衔接下一阶段学习要求'],
              },
            ]
          : []),
        {
          period: '中考前',
          phase: '备考冲刺',
          coreTasks: ['按考纲分模块复习', '每周2套限时模拟卷', '回归基础错题'],
          expectedOutcomes: ['中考成绩达到预期目标'],
        },
      ]
    : [
        {
          period: `${form.grade}阶段`,
          phase: '能力建构',
          coreTasks: ['完成选科科目体系化学习', '建立专题笔记本', '每周总结学习日志'],
          expectedOutcomes: ['选科科目形成稳定优势'],
        },
        {
          period: '升学冲刺期',
          phase: primaryGoal === '高考' ? '高考冲刺' : '目标导向强化',
          coreTasks: ['套卷限时训练', '专题突破高频失分点', '关注目标升学政策节点'],
          expectedOutcomes: ['达成目标方向所需的核心能力指标'],
        },
      ]

  const subjectPaths = isCompetition
    ? [
        { subject: '数学', importance: 5, timePercent: 35, keyKnowledgePoints: ['代数', '几何', '数论', '组合'], resourceTypes: ['竞赛教程', '专题训练', '历年真题'] },
        { subject: '物理', importance: 4, timePercent: 25, keyKnowledgePoints: ['力学', '电磁学', '光学'], resourceTypes: ['竞赛题集', '实验拓展'] },
        { subject: '语文', importance: 3, timePercent: 15, keyKnowledgePoints: ['阅读理解', '写作'], resourceTypes: ['阅读精选', '作文素材'] },
        { subject: '英语', importance: 3, timePercent: 15, keyKnowledgePoints: ['词汇', '阅读', '写作'], resourceTypes: ['词汇手册', '外刊精读'] },
      ]
    : [
        { subject: '数学', importance: 5, timePercent: 25, keyKnowledgePoints: ['函数', '方程', '几何证明'], resourceTypes: ['同步练习', '专题突破', '模拟试卷'] },
        { subject: '语文', importance: 4, timePercent: 20, keyKnowledgePoints: ['阅读理解', '古诗文', '写作'], resourceTypes: ['阅读训练', '作文素材', '真题精练'] },
        { subject: '英语', importance: 4, timePercent: 20, keyKnowledgePoints: ['词汇语法', '阅读完形', '听力写作'], resourceTypes: ['词汇手册', '真题套卷'] },
        { subject: '物理', importance: isJunior ? 4 : 5, timePercent: 20, keyKnowledgePoints: ['力学', '压强', '电学'], resourceTypes: ['实验视频', '同步题集'] },
      ]

  const phaseTasks = [
    {
      phase: `${form.grade} · 第一学期`,
      tasks: [
        {
          name: '核心知识点清单梳理',
          criteria: '完成主科知识清单标注掌握度',
          duration: '2周',
          knowledgePoints: ['本学期全部核心考点'],
          relatedExercises: ['同步练习册对应章节', '基础巩固卷'],
        },
        {
          name: '周测错题闭环',
          criteria: '每周错题100%复盘并重做',
          duration: '持续整学期',
          knowledgePoints: ['个人薄弱点'],
          relatedExercises: ['错题同类题', '周测卷'],
        },
      ],
    },
    {
      phase: `${form.grade} · 第二学期`,
      tasks: [
        {
          name: '综合应用题专项',
          criteria: '中等难度综合题正确率≥70%',
          duration: '4周',
          knowledgePoints: ['跨章节综合应用'],
          relatedExercises: ['专题训练卷', '模拟套卷'],
        },
      ],
    },
  ]

  const milestones =
    primaryGoal === '中考' || isJunior
      ? [
          { date: '10月', event: '第一次模拟考', preparationAdvice: '全面诊断薄弱模块，调整复习重心' },
          { date: '3月', event: '中考报名', preparationAdvice: '核对政策与材料，确认体育与实验安排' },
          { date: '4-5月', event: '一模/二模', preparationAdvice: '限时套卷训练，建立志愿参考线' },
          { date: '6月', event: '中考与志愿填报', preparationAdvice: '保持稳定作息，志愿梯度填报' },
        ]
      : [
          { date: '11月', event: '第一次联考/一模', preparationAdvice: '定位排名，调整复习计划' },
          { date: '4月', event: '二模', preparationAdvice: '接近高考难度，训练时间分配' },
          { date: '6月', event: '高考与志愿填报', preparationAdvice: '回归基础错题，稳定发挥' },
        ]

  const risks = []
  if (form.scoreLevel === '待提升' || form.scoreLevel === '中等') {
    risks.push({
      risk: '基础薄弱可能导致后续难度提升时跟不上进度',
      impact: '高',
      mitigation: '先完成基础回补再进入综合题；每日固定30分钟基础训练；降低初期任务难度建立信心',
    })
  }
  if (isCompetition && form.scoreLevel !== '优秀') {
    risks.push({
      risk: '竞赛与课内进度双线并行，时间压力较大',
      impact: '中',
      mitigation: '设定竞赛/课内时间比例（如3:7）；优先保证课内成绩不掉队',
    })
  }
  if (goals.length > 2) {
    risks.push({
      risk: '目标方向过多可能导致精力分散',
      impact: '中',
      mitigation: '确定1个主目标、1个备选目标；阶段性复盘是否调整方向',
    })
  }
  if (risks.length === 0) {
    risks.push({
      risk: '规划执行不到位可能导致预期成果打折',
      impact: '中',
      mitigation: '每周固定复盘；家长/教师监督关键节点；根据周测结果动态调整任务量',
    })
  }

  return {
    title: `${form.studentName} · ${form.grade} · 个性化教育规划方案`,
    generatedAt: new Date().toISOString(),
    studentProfile: {
      name: form.studentName,
      grade: form.grade,
      scoreLevel: form.scoreLevel,
      goalDirections: goals,
      interests: form.interests ?? [],
      parentExpectations: form.parentExpectations || '未填写',
      specialNotes: form.specialNotes || '无',
    },
    abilityDimensions,
    stageGoals,
    subjectPaths,
    phaseTasks,
    milestones,
    risks,
    source: 'mock',
  }
}
