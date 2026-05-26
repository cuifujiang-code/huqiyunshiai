/** 八年级物理期中考试 · 72分 · 模拟诊断报告 */
export function buildMockDiagnosisReport(form = {}) {
  const score = form.score ?? 72
  const fullScore = form.fullScore ?? 100
  const gradeRank = form.gradeRank ?? 128

  return {
    title: '八年级物理期中考试 · AI学习诊断报告',
    generatedAt: new Date().toISOString(),
    scoreOverview: {
      score,
      fullScore,
      gradeRank,
      classRank: 18,
      previousScore: 65,
      trend: 'up',
      trendDelta: 7,
      percentile: 62,
    },
    lossAnalysis: [
      {
        type: 'knowledge',
        label: '知识缺陷型',
        percentage: 45,
        color: '#ef4444',
        explanation: '压强公式 p=F/S 与 p=ρgh 混淆，实验题中控制变量法理解不到位。',
      },
      {
        type: 'ability',
        label: '能力不足型',
        percentage: 30,
        color: '#f97316',
        explanation: '综合计算题中单位换算（cm²→m²）频繁出错，多步推导逻辑断裂。',
      },
      {
        type: 'skill',
        label: '应试技巧型',
        percentage: 15,
        color: '#eab308',
        explanation: '选择题存在"看到数字就选"的惯性，未回归题干条件逐一排除。',
      },
      {
        type: 'psychology',
        label: '心理因素型',
        percentage: 10,
        color: '#3b82f6',
        explanation: '实验探究大题因前面计算题耗时过多，后半场心态急躁导致审题不清。',
      },
    ],
    weakPoints: [
      {
        id: 'wp1',
        name: '压强计算',
        weight: 5,
        typicalWrong: '计算容器底面压强时，误将 200 cm² 直接代入公式，未换算为 0.02 m²，导致结果偏大 10000 倍。',
        correctSolution: '先统一单位：S=200 cm²=0.02 m²，再代入 p=F/S 或 p=ρgh。建议每步计算后标注单位，养成"单位检查"习惯。',
      },
      {
        id: 'wp2',
        name: '液体压强公式',
        weight: 4,
        typicalWrong: '认为液体压强与容器形状有关，在判断 U 形管高度差变化时选错方向。',
        correctSolution: '牢记 p=ρgh：同种液体仅与密度和深度有关。U 形管高度差反映压强差 Δp=ρgΔh。',
      },
      {
        id: 'wp3',
        name: '实验探究题',
        weight: 5,
        typicalWrong: '探究"液体压强与深度关系"时，未说明控制变量（保持液体密度不变），结论表述不完整。',
        correctSolution: '采用控制变量法：每次只改变深度 h，保持 ρ 不变，记录 U 形管液面高度差，得出"同种液体压强随深度增大而增大"。',
      },
      {
        id: 'wp4',
        name: '固体压强应用',
        weight: 3,
        typicalWrong: '比较不同放置方式压强时，忽略压力 F 始终等于重力 G 不变这一前提。',
        correctSolution: '水平面静止时 F=G 不变，压强变化仅由 S 决定：S 越小 p 越大。',
      },
      {
        id: 'wp5',
        name: '连通器原理',
        weight: 2,
        typicalWrong: '认为连通器各容器液面高度一定相同，未考虑是否同种液体且静止。',
        correctSolution: '同种液体静止时连通器各容器液面总保持相平，船闸是典型应用。',
      },
    ],
    wrongQuestions: [
      {
        id: 'wq1',
        content:
          '底面积为 200 cm² 的容器内装深 30 cm 的水（ρ水=1.0×10³ kg/m³，g=10 N/kg）。求容器底部受到水的压强。',
        studentAnswer: 'p = ρgh = 1.0×10³ × 10 × 30 = 3×10⁵ Pa（未换算深度单位）',
        correctAnswer: 'h = 30 cm = 0.3 m，p = ρgh = 1.0×10³ × 10 × 0.3 = 3000 Pa',
        thinkingBlock:
          '思维卡点：看到"30 cm"直接代入公式，未意识到 ρgh 中 h 必须用米（m）。建议遇到长度单位先画线换算，再代入计算。',
      },
      {
        id: 'wq2',
        content:
          '【实验探究】用 U 形管压强计探究液体内部压强与深度的关系。当探头从 10 cm 移至 20 cm 深处时，U 形管液面高度差如何变化？请说明理由。',
        studentAnswer: '高度差不变，因为液体压强与深度无关。',
        correctAnswer: '高度差增大。同种液体内部压强随深度增加而增大，U 形管两侧压强差增大，液面高度差随之增大。',
        thinkingBlock:
          '思维卡点：将"液体压强与容器形状无关"错误推广为"与深度无关"。需区分：形状无关 ≠ 深度无关，p=ρgh 中 h 是核心变量。',
      },
    ],
    improvementPlan: [
      {
        day: 'Day 1-2',
        tasks: [
          { id: 't1', text: '完成《压强计算》专项练习 10 道（含单位换算专项）', completed: false },
          { id: 't2', text: '整理错题本：标注每道计算题的单位换算步骤', completed: false },
        ],
      },
      {
        day: 'Day 3-4',
        tasks: [
          { id: 't3', text: '复习《液体压强》知识点，完成思维导图（ρgh 适用条件）', completed: false },
          { id: 't4', text: '观看实验视频：U 形管压强计的使用与控制变量法', completed: false },
        ],
      },
      {
        day: 'Day 5-7',
        tasks: [
          { id: 't5', text: '限时训练压强综合题 5 道（每题 8 分钟）', completed: false },
          { id: 't6', text: '模拟实验探究题 2 道，按"猜想→控制变量→结论"模板作答', completed: false },
        ],
      },
      {
        day: 'Day 8-10',
        tasks: [
          { id: 't7', text: '完成期中错题重做（计算题 + 实验题各 3 道）', completed: false },
          { id: 't8', text: '自测：30 分钟完成压强单元小测，目标 85 分以上', completed: false },
        ],
      },
      {
        day: 'Day 11-14',
        tasks: [
          { id: 't9', text: '综合训练：固体压强 + 液体压强混合题 4 道', completed: false },
          { id: 't10', text: '总结本周学习日志，列出仍不确定的 3 个问题请教老师', completed: false },
        ],
      },
    ],
    recommendedExercises: [
      {
        id: 'ex1',
        content: '一个重 500 N 的木箱，与地面接触面积 0.25 m²，求对地面压强。',
        type: '计算题',
        difficulty: '基础',
      },
      {
        id: 'ex2',
        content: '判断：液体压强的大小与容器的形状有关。（　　）',
        type: '选择题',
        difficulty: '基础',
      },
      {
        id: 'ex3',
        content: '潜水员在 20 m 深处受到的液体压强是多少？（ρ海水=1.03×10³ kg/m³）',
        type: '计算题',
        difficulty: '中等',
      },
      {
        id: 'ex4',
        content: '设计实验探究液体压强与深度的关系，写出主要步骤和结论。',
        type: '实验探究题',
        difficulty: '拔高',
      },
      {
        id: 'ex5',
        content: '比较同一块砖平放与竖放时对地面压强的大小关系，并说明理由。',
        type: '简答题',
        difficulty: '中等',
      },
    ],
  }
}
