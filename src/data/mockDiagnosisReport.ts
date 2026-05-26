import type { DiagnosisFormData, DiagnosisReport } from '../types/diagnosis'

/** 前端本地模拟诊断报告（不依赖后端） */
export function buildLocalDiagnosisReport(form?: Partial<DiagnosisFormData>): DiagnosisReport {
  const score = form?.score ?? 72
  const fullScore = form?.fullScore ?? 100
  const gradeRank = form?.gradeRank ?? 156

  return {
    title: '八年级物理期中考试 · AI学习诊断报告',
    generatedAt: new Date().toISOString(),
    scoreOverview: {
      score,
      fullScore,
      gradeRank,
      gradeTotal: 520,
      previousRank: 189,
      rankImprovement: 33,
      trend: 'up',
      trendDelta: 33,
      percentile: 70,
    },
    lossAnalysis: [
      {
        type: 'knowledge',
        label: '知识缺陷型',
        percentage: 40,
        color: '#ef4444',
        explanation: '固体压强与液体压强公式混用，对 p=ρgh 中深度 h 的物理意义理解不清。',
      },
      {
        type: 'ability',
        label: '能力不足型',
        percentage: 25,
        color: '#f97316',
        explanation: '压强综合应用题中多步推导能力不足，单位换算（cm→m）经常遗漏。',
      },
      {
        type: 'skill',
        label: '应试技巧型',
        percentage: 20,
        color: '#eab308',
        explanation: '选择题未仔细审题，对"容器底部压强"类题目忽略液体深度条件。',
      },
      {
        type: 'psychology',
        label: '心理因素型',
        percentage: 15,
        color: '#3b82f6',
        explanation: '实验探究题因前面耗时过多，后半场紧张导致原理表述不完整。',
      },
    ],
    weakPoints: [
      {
        id: 'wp1',
        name: '固体压强计算',
        weight: 5,
        typicalWrong: '计算物块对地面压强时，误用 p=ρgh 而非 p=F/S，导致公式选择错误。',
        correctSolution: '固体对接触面压强用 p=F/S，F 为垂直压力（通常等于重力），S 为接触面积，注意单位统一为 m²。',
      },
      {
        id: 'wp2',
        name: '液体压强公式应用',
        weight: 5,
        typicalWrong: '计算容器底部液体压强时，将 30 cm 深度直接代入 p=ρgh，未换算为 0.3 m。',
        correctSolution: '液体压强 p=ρgh，h 必须为液面到该点的竖直深度，且统一用国际单位（m、kg/m³）。',
      },
      {
        id: 'wp3',
        name: '大气压强实验探究',
        weight: 4,
        typicalWrong: '托里拆利实验中，误认为玻璃管内水银柱高度与试管粗细有关。',
        correctSolution: '托里拆利实验测得大气压等于水银柱产生的液体压强 p=ρgh，在海拔一定时高度 h 与管径无关。',
      },
      {
        id: 'wp4',
        name: '压强综合应用题',
        weight: 4,
        typicalWrong: '面对"先算固体压强再算液体压强"的综合题，无法正确拆分步骤、建立等量关系。',
        correctSolution: '综合题按"识别研究对象→选公式（固体 p=F/S，液体 p=ρgh）→列方程→统一单位→求解"分步完成。',
      },
    ],
    wrongQuestions: [
      {
        id: 'wq1',
        content:
          '【选择题】如图所示，三个底面积相同的容器分别装有同种液体，液面高度分别为 10 cm、20 cm、30 cm。哪个容器底部受到的液体压强最大？',
        studentAnswer: '选 A（10 cm 容器），认为液面越低压强越小，忽略了液体深度对压强的影响。',
        correctAnswer: '选 C（30 cm 容器）。同种液体 p=ρgh，深度 h 越大压强越大，30 cm 处底部压强最大。',
        thinkingBlock:
          '错误原因：忽略了液体深度对压强的影响，误以为"液面低=压强小"。核心：液体压强只与 ρ 和 h 有关，与容器形状无关。',
      },
      {
        id: 'wq2',
        content:
          '【实验探究题】请说明托里拆利实验的原理，并解释为什么玻璃管内水银柱上方是真空，水银柱高度约为 760 mm。',
        studentAnswer: '大气压把水银压进试管，水银越多高度越高；上方真空是因为空气被水银堵住了。',
        correctAnswer:
          '大气压支撑水银柱；管内上方水银柱产生的压强 p=ρgh 与管外大气压平衡，故 h≈760 mm（标准大气压下）。上方为托里拆利真空（接近真空），并非简单"被堵住"。',
        thinkingBlock:
          '错误原因：对实验原理理解不透彻，未建立"大气压=水银柱压强"的平衡关系，对真空成因表述不准确。',
      },
    ],
    improvementPlan: [
      { day: 'Day 1', tasks: [{ id: 'd1', text: '复习 p=F/S 与 p=ρgh 的适用条件，完成对比表格', completed: false }] },
      { day: 'Day 2', tasks: [{ id: 'd2', text: '固体压强计算专项 8 道，重点练习单位换算', completed: false }] },
      { day: 'Day 3', tasks: [{ id: 'd3', text: '液体压强公式应用 8 道，每题标注深度 h 的取值', completed: false }] },
      { day: 'Day 4', tasks: [{ id: 'd4', text: '观看托里拆利实验视频，写出原理与现象解释', completed: false }] },
      { day: 'Day 5', tasks: [{ id: 'd5', text: '大气压强实验探究题 3 道，按"现象→原理→结论"作答', completed: false }] },
      { day: 'Day 6', tasks: [{ id: 'd6', text: '压强综合应用题 4 道，限时 10 分钟/题', completed: false }] },
      { day: 'Day 7', tasks: [{ id: 'd7', text: '整理本周错题，重做错题 1、错题 2 同类题各 2 道', completed: false }] },
      { day: 'Day 8', tasks: [{ id: 'd8', text: '复习连通器原理，完成船闸工作原理简述', completed: false }] },
      { day: 'Day 9', tasks: [{ id: 'd9', text: '固体+液体压强混合练习 5 道', completed: false }] },
      { day: 'Day 10', tasks: [{ id: 'd10', text: '模拟实验探究题 2 道（U 形管、托里拆利各 1）', completed: false }] },
      { day: 'Day 11', tasks: [{ id: 'd11', text: '压强单元选择题限时训练 15 道（20 分钟）', completed: false }] },
      { day: 'Day 12', tasks: [{ id: 'd12', text: '计算题综合训练 4 道，要求写出完整解题步骤', completed: false }] },
      { day: 'Day 13', tasks: [{ id: 'd13', text: '自测卷一套（45 分钟），目标 80 分以上', completed: false }] },
      { day: 'Day 14', tasks: [{ id: 'd14', text: '总结14天学习日志，列出 3 个待请教老师的问题', completed: false }] },
    ],
    recommendedExercises: [
      {
        id: 'ex1',
        content: '重 600 N 的物体，接触面积 0.2 m²，求对地面压强。（固体压强基础）',
        type: '计算题',
        difficulty: '基础',
      },
      {
        id: 'ex2',
        content: '水深 0.4 m 处液体压强是多少？（ρ=1.0×10³ kg/m³，g=10 N/kg）',
        type: '计算题',
        difficulty: '基础',
      },
      {
        id: 'ex3',
        content: '三个相同底面积容器装同种液体，液面高度不同，底部压强最大的是？',
        type: '选择题',
        difficulty: '中等',
      },
      {
        id: 'ex4',
        content: '简述托里拆利实验的原理，并说明水银柱高度与大气压的关系。',
        type: '实验探究题',
        difficulty: '中等',
      },
      {
        id: 'ex5',
        content: '圆柱形容器底面积 100 cm²，装深 25 cm 的水，求底部压强。（综合单位换算）',
        type: '计算题',
        difficulty: '拔高',
      },
    ],
  }
}
