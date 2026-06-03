import type { ExamDataReference } from '../types/planning'

// ============================================================
// AI-powered exam data service
// 生产环境应替换为真实 API 调用或 DeepSeek 数据采集
// ============================================================

/** 省份-城市映射（常用） */
const PROVINCE_CITY_MAP: Record<string, string[]> = {
  '浙江': ['杭州', '宁波', '温州', '绍兴', '嘉兴', '湖州', '金华', '台州', '丽水', '衢州', '舟山'],
  '江苏': ['南京', '苏州', '无锡', '常州', '南通', '徐州', '扬州', '镇江', '泰州', '盐城', '淮安', '连云港', '宿迁'],
  '广东': ['广州', '深圳', '东莞', '佛山', '珠海', '中山', '惠州', '江门', '汕头', '湛江', '茂名'],
  '北京': ['北京市'],
  '上海': ['上海市'],
  '四川': ['成都', '绵阳', '德阳', '南充', '宜宾', '泸州', '达州', '乐山'],
  '湖北': ['武汉', '襄阳', '宜昌', '荆州', '十堰', '孝感', '黄冈'],
  '山东': ['济南', '青岛', '烟台', '潍坊', '济宁', '临沂', '淄博', '威海'],
  '河南': ['郑州', '洛阳', '南阳', '新乡', '开封', '安阳', '许昌'],
  '湖南': ['长沙', '株洲', '湘潭', '衡阳', '岳阳', '常德', '郴州'],
  '福建': ['福州', '厦门', '泉州', '漳州', '莆田', '龙岩'],
  '安徽': ['合肥', '芜湖', '蚌埠', '淮南', '马鞍山', '安庆', '阜阳'],
  '河北': ['石家庄', '唐山', '保定', '邯郸', '秦皇岛', '廊坊'],
  '陕西': ['西安', '咸阳', '宝鸡', '渭南', '汉中', '延安'],
}

/** 中考科目配置 */
const ZHONGKAO_SUBJECTS = [
  { subject: '语文', fullScore: 120 },
  { subject: '数学', fullScore: 120 },
  { subject: '英语', fullScore: 120 },
  { subject: '科学', fullScore: 160 },
  { subject: '社会·法治', fullScore: 80 },
  { subject: '体育', fullScore: 40 },
]

/** 高考科目配置（新高考3+3模式） */
const GAOKAO_SUBJECTS = [
  { subject: '语文', fullScore: 150 },
  { subject: '数学', fullScore: 150 },
  { subject: '英语', fullScore: 150 },
  { subject: '物理', fullScore: 100 },
  { subject: '化学', fullScore: 100 },
  { subject: '生物', fullScore: 100 },
  { subject: '历史', fullScore: 100 },
  { subject: '地理', fullScore: 100 },
  { subject: '政治', fullScore: 100 },
  { subject: '技术', fullScore: 100 },
]

/**
 * 根据省份/城市生成模拟考试数据
 * 数据基于公开统计信息进行模拟，仅供参考
 */
function generateMockExamData(
  province: string,
  city: string,
  examType: '中考' | '高考',
  year: number
): ExamDataReference {
  const isGaokao = examType === '高考'
  const baseSubjects = isGaokao ? GAOKAO_SUBJECTS : ZHONGKAO_SUBJECTS

  // 根据省份添加随机波动因子（不同地区难度不同）
  const difficultyMap: Record<string, number> = {
    '浙江': -2, '江苏': -3, '上海': -5, '北京': -4,
    '广东': 0, '四川': 2, '河南': 5, '山东': 1,
    '湖北': -1, '湖南': 0, '福建': 1, '河北': 3,
    '安徽': 4, '陕西': 3,
  }
  const diffFactor = difficultyMap[province] ?? 0

  // 生成科目数据
  const subjects = baseSubjects.map((s) => {
    // 基础平均分约为满分的 65%-75%
    const baseRatio = isGaokao ? (s.subject === '英语' || s.subject === '语文' ? 0.70 : 0.68) : 0.72
    const avgScore = Math.round(s.fullScore * (baseRatio + diffFactor / 100 + (Math.random() * 0.08)))
    const topScore = Math.round(s.fullScore * (0.92 + Math.random() * 0.06))

    // 分数线
    let cutoffLines: { tier: string; score: number }[] = []
    if (isGaokao) {
      const totalFull = 750
      cutoffLines = [
        { tier: '特控线(一本)', score: Math.round(totalFull * (0.58 + diffFactor / 200)) },
        { tier: '本科线', score: Math.round(totalFull * (0.46 + diffFactor / 250)) },
        { tier: '专科线', score: Math.round(totalFull * (0.22 + diffFactor / 400)) },
      ]
    } else {
      const totalFull = 640 // 中考总分因省而异，此处取典型值
      cutoffLines = [
        { tier: '重高线', score: Math.round(totalFull * (0.78 + diffFactor / 300)) },
        { tier: '普高线', score: Math.round(totalFull * (0.55 + diffFactor / 350)) },
        { tier: '职高分线', score: Math.round(totalFull * (0.30 + diffFactor / 500)) },
      ]
    }

    return {
      ...s,
      avgScore: Math.max(0, Math.min(s.fullScore, avgScore)),
      topScore: Math.max(avgScore, Math.min(s.fullScore, topScore)),
      cutoffLines,
    }
  })

  // 使用第一个科目的分数线作为总体分数线（避免重复）
  const finalCutoffLines = subjects[0]?.cutoffLines ?? []

  // 生成重点学校数据
  const keySchoolTemplates: Record<string, { name: string; ranking: number }[]> = {
    default: [
      { name: `${city}第一中学`, ranking: 1 },
      { name: `${city}第二中学`, ranking: 2 },
      { name: `${city}高级中学`, ranking: 3 },
      { name: `${province}实验中学(${city}校区)`, ranking: 5 },
      { name: `${city}外国语学校`, ranking: 8 },
    ],
    杭州: [
      { name: '杭州第二中学', ranking: 1 },
      { name: '杭州学军中学', ranking: 2 },
      { name: '杭州高级中学', ranking: 3 },
      { name: '杭州第十四中学', ranking: 5 },
      { name: '浙江大学附属中学', ranking: 6 },
    ],
    北京: [
      { name: '中国人民大学附中', ranking: 1 },
      { name: '北京四中', ranking: 2 },
      { name: '清华附中', ranking: 3 },
      { name: '北大附中', ranking: 4 },
      { name: '北京师范大学附中', ranking: 5 },
    ],
    上海: [
      { name: '上海中学', ranking: 1 },
      { name: '华东师大二附中', ranking: 2 },
      { name: '复旦附中', ranking: 3 },
      { name: '交大附中', ranking: 4 },
      { name: '七宝中学', ranking: 5 },
    ],
    南京: [
      { name: '南京外国语学校', ranking: 1 },
      { name: '南京师范大学附中', ranking: 2 },
      { name: '金陵中学', ranking: 3 },
      { name: '中华中学', ranking: 5 },
      { name: '南京第一中学', ranking: 7 },
    ],
    广州: [
      { name: '华南师范大学附中', ranking: 1 },
      { name: '广东省实验中学', ranking: 2 },
      { name: '广州市执信中学', ranking: 3 },
      { name: '广州市第二中学', ranking: 5 },
      { name: '广雅中学', ranking: 6 },
    ],
    深圳: [
      { name: '深圳中学', ranking: 1 },
      { name: '深圳实验学校', ranking: 2 },
      { name: '深圳外国语学校', ranking: 3 },
      { name: '深圳市高级中学', ranking: 4 },
      { name: '深圳大学附中', ranking: 6 },
    ],
    成都: [
      { name: '成都第七中学', ranking: 1 },
      { name: '成都外国语学校', ranking: 2 },
      { name: '成都石室中学', ranking: 3 },
      { name: '成都树德中学', ranking: 4 },
      { name: '四川师范大学附中', ranking: 5 },
    ],
    武汉: [
      { name: '华中师范大学第一附中', ranking: 1 },
      { name: '武汉第二中学', ranking: 2 },
      { name: '武汉外国语学校', ranking: 3 },
      { name: '湖北省实验中学', ranking: 4 },
      { name: '武汉第一中学', ranking: 6 },
    ],
    长沙: [
      { name: '长沙市第一中学', ranking: 1 },
      { name: '湖南师范大学附中', ranking: 2 },
      { name: '长郡中学', ranking: 3 },
      { name: '雅礼中学', ranking: 4 },
      { name: '长沙市周南中学', ranking: 6 },
    ],
  }

  const schoolTemplate =
    keySchoolTemplates[city] ??
    keySchoolTemplates[province] ??
    keySchoolTemplates.default

  // 根据分数线计算最低录取分
  const baseCutoff = finalCutoffLines.find((l) => l.tier.includes('一') || l.tier.includes('重'))?.score ?? 550

  const keySchools = schoolTemplate.map((s) => ({
    name: s.name,
    minScore: baseCutoff + Math.floor(Math.random() * 30) - s.ranking * 3,
    ranking: s.ranking,
  }))

  return {
    province,
    city,
    year,
    examType,
    subjects: subjects.map(({ fullScore, ...rest }) => rest),
    keySchools,
    updatedAt: new Date().toISOString(),
    source: 'AI数据采集（仅供参考，非官方数据）',
  }
}

/**
 * 获取指定地区的考试数据（模拟）
 *
 * @param params - 查询参数
 * @returns 考试数据结果
 *
 * @example
 * ```ts
 * const result = await fetchExamData({ province: '浙江', city: '杭州', examType: '中考' })
 * if (result.success) {
 *   console.log(result.data?.subjects)   // 科目平均分等
 *   console.log(result.data?.keySchools)  // 重点学校录取分
 * }
 * ```
 */
export async function fetchExamData(params: {
  province: string
  city: string
  examType: '中考' | '高考'
  year?: number
}): Promise<{ success: boolean; data?: ExamDataReference; message?: string }> {
  const currentYear = new Date().getFullYear()
  const year = params.year || currentYear

  if (!params.province.trim()) {
    return { success: false, message: '请选择省份' }
  }
  if (!params.city.trim()) {
    return { success: false, message: '请选择城市' }
  }

  // 模拟网络延迟（300~800ms）
  await new Promise((resolve) =>
    setTimeout(resolve, 300 + Math.random() * 500)
  )

  try {
    const data = generateMockExamData(params.province, params.city, params.examType, year)
    return { success: true, data }
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : '获取考试数据失败',
    }
  }
}

/**
 * 获取支持查询的省份列表
 */
export function getSupportedProvinces(): string[] {
  return Object.keys(PROVINCE_CITY_MAP)
}

/**
 * 根据省份获取城市列表
 */
export function getCitiesByProvince(province: string): string[] {
  return PROVINCE_CITY_MAP[province] ?? []
}
