/**
 * 2025 年全国 31 省（区、市）高考参考数据
 * 分数线来源：各省教育考试院 2025 年公布；一分一段为公开信息整理或基于控制线估算
 */
import type { ExamDataReference } from '../types/planning'
import {
  buildExamRef,
  estimateSegments,
  seg,
  subjectTotal,
  trackSubject,
} from './examReferenceHelpers'

type GaokaoTemplate = Omit<ExamDataReference, 'city' | 'year'>

function physicsHistory(
  province: string,
  physics: { teKong: number; benKe: number; zhuanKe: number; total: number; top?: number },
  history: { teKong: number; benKe: number; zhuanKe: number; total: number; top?: number },
  keySchools: GaokaoTemplate['keySchools'],
): GaokaoTemplate {
  const pTop = physics.top ?? 750
  const hTop = history.top ?? 750
  return {
    province,
    examType: '高考',
    subjects: [
      trackSubject(
        '物理类',
        pTop,
        Math.round((physics.teKong + physics.benKe) / 2),
        [
          { tier: '特控线', score: physics.teKong },
          { tier: '本科线', score: physics.benKe },
          { tier: '专科线', score: physics.zhuanKe },
        ],
        estimateSegments(pTop, physics.teKong, physics.benKe, physics.zhuanKe, physics.total),
      ),
      trackSubject(
        '历史类',
        hTop,
        Math.round((history.teKong + history.benKe) / 2),
        [
          { tier: '特控线', score: history.teKong },
          { tier: '本科线', score: history.benKe },
          { tier: '专科线', score: history.zhuanKe },
        ],
        estimateSegments(hTop, history.teKong, history.benKe, history.zhuanKe, history.total),
      ),
    ],
    keySchools,
    updatedAt: '2025-06-25T00:00:00.000Z',
    source: `2025年${province}高考分数线（省教育考试院公布）及一分一段参考`,
  }
}

function unified(
  province: string,
  maxScore: number,
  cutoffs: { tier: string; score: number }[],
  segments: ReturnType<typeof seg>[],
  keySchools: GaokaoTemplate['keySchools'],
  source?: string,
): GaokaoTemplate {
  const teKong = cutoffs.find((c) => c.tier.includes('特'))?.score ?? cutoffs[0].score
  const benKe = cutoffs.find((c) => c.tier.includes('本') || c.tier.includes('一段'))?.score ?? cutoffs[1]?.score ?? teKong
  return {
    province,
    examType: '高考',
    subjects: [
      subjectTotal(maxScore, Math.round((teKong + benKe) / 2), cutoffs, segments),
    ],
    keySchools,
    updatedAt: '2025-06-25T00:00:00.000Z',
    source: source ?? `2025年${province}高考分数线（省教育考试院公布）及一分一段参考`,
  }
}

export const GAOBAO_PROVINCE_DATA: Record<string, GaokaoTemplate> = {
  北京: unified(
    '北京',
    750,
    [
      { tier: '特控线', score: 519 },
      { tier: '本科线', score: 430 },
      { tier: '专科线', score: 120 },
    ],
    [
      seg(700, 120), seg(680, 800), seg(660, 2500), seg(640, 6000),
      seg(620, 12000), seg(600, 20000), seg(580, 32000), seg(560, 45000),
      seg(519, 58000), seg(480, 85000), seg(430, 120000), seg(350, 180000),
    ],
    [
      { name: '清华大学', minScore: 685, ranking: 1 },
      { name: '北京大学', minScore: 683, ranking: 2 },
      { name: '中国人民大学', minScore: 660, ranking: 5 },
      { name: '北京师范大学', minScore: 640, ranking: 10 },
      { name: '北京航空航天大学', minScore: 635, ranking: 12 },
    ],
  ),

  天津: unified(
    '天津',
    750,
    [
      { tier: '特控线', score: 562 },
      { tier: '本科线', score: 476 },
      { tier: '专科线', score: 160 },
    ],
    estimateSegments(750, 562, 476, 160, 68000),
    [
      { name: '南开大学', minScore: 640, ranking: 1 },
      { name: '天津大学', minScore: 635, ranking: 2 },
      { name: '天津医科大学', minScore: 610, ranking: 8 },
      { name: '河北工业大学', minScore: 590, ranking: 15 },
      { name: '天津师范大学', minScore: 560, ranking: 25 },
    ],
  ),

  河北: physicsHistory(
    '河北',
    { teKong: 499, benKe: 459, zhuanKe: 200, total: 650000 },
    { teKong: 527, benKe: 477, zhuanKe: 200, total: 280000 },
    [
      { name: '华北电力大学(保定)', minScore: 610, ranking: 1 },
      { name: '河北工业大学', minScore: 600, ranking: 3 },
      { name: '燕山大学', minScore: 560, ranking: 10 },
      { name: '河北大学', minScore: 540, ranking: 18 },
      { name: '河北师范大学', minScore: 520, ranking: 25 },
    ],
  ),

  山西: physicsHistory(
    '山西',
    { teKong: 507, benKe: 419, zhuanKe: 100, total: 320000 },
    { teKong: 534, benKe: 443, zhuanKe: 100, total: 150000 },
    [
      { name: '太原理工大学', minScore: 560, ranking: 1 },
      { name: '山西大学', minScore: 545, ranking: 3 },
      { name: '中北大学', minScore: 520, ranking: 8 },
      { name: '山西师范大学', minScore: 500, ranking: 15 },
      { name: '山西财经大学', minScore: 490, ranking: 20 },
    ],
  ),

  内蒙古: physicsHistory(
    '内蒙古',
    { teKong: 487, benKe: 375, zhuanKe: 160, total: 180000 },
    { teKong: 523, benKe: 418, zhuanKe: 160, total: 90000 },
    [
      { name: '内蒙古大学', minScore: 530, ranking: 1 },
      { name: '内蒙古工业大学', minScore: 500, ranking: 5 },
      { name: '内蒙古师范大学', minScore: 480, ranking: 10 },
      { name: '内蒙古农业大学', minScore: 460, ranking: 15 },
      { name: '内蒙古医科大学', minScore: 450, ranking: 18 },
    ],
  ),

  辽宁: physicsHistory(
    '辽宁',
    { teKong: 515, benKe: 367, zhuanKe: 150, total: 190000 },
    { teKong: 522, benKe: 437, zhuanKe: 150, total: 100000 },
    [
      { name: '大连理工大学', minScore: 620, ranking: 1 },
      { name: '东北大学', minScore: 610, ranking: 2 },
      { name: '大连海事大学', minScore: 580, ranking: 8 },
      { name: '辽宁大学', minScore: 560, ranking: 15 },
      { name: '东北财经大学', minScore: 555, ranking: 18 },
    ],
  ),

  吉林: physicsHistory(
    '吉林',
    { teKong: 479, benKe: 340, zhuanKe: 160, total: 130000 },
    { teKong: 493, benKe: 384, zhuanKe: 160, total: 70000 },
    [
      { name: '吉林大学', minScore: 590, ranking: 1 },
      { name: '东北师范大学', minScore: 560, ranking: 5 },
      { name: '延边大学', minScore: 520, ranking: 12 },
      { name: '长春理工大学', minScore: 500, ranking: 18 },
      { name: '东北电力大学', minScore: 490, ranking: 22 },
    ],
  ),

  黑龙江: physicsHistory(
    '黑龙江',
    { teKong: 472, benKe: 360, zhuanKe: 160, total: 180000 },
    { teKong: 480, benKe: 405, zhuanKe: 160, total: 100000 },
    [
      { name: '哈尔滨工业大学', minScore: 620, ranking: 1 },
      { name: '哈尔滨工程大学', minScore: 580, ranking: 5 },
      { name: '东北林业大学', minScore: 540, ranking: 12 },
      { name: '东北农业大学', minScore: 520, ranking: 18 },
      { name: '黑龙江大学', minScore: 500, ranking: 25 },
    ],
  ),

  上海: unified(
    '上海',
    660,
    [
      { tier: '特控线', score: 505 },
      { tier: '本科线', score: 402 },
      { tier: '专科线', score: 100 },
    ],
    [
      seg(650, 200), seg(630, 1500), seg(610, 4000), seg(590, 8000),
      seg(570, 15000), seg(550, 25000), seg(530, 38000), seg(505, 50000),
      seg(480, 70000), seg(450, 95000), seg(402, 120000),
    ],
    [
      { name: '复旦大学', minScore: 580, ranking: 1 },
      { name: '上海交通大学', minScore: 578, ranking: 2 },
      { name: '同济大学', minScore: 560, ranking: 5 },
      { name: '华东师范大学', minScore: 540, ranking: 10 },
      { name: '上海财经大学', minScore: 545, ranking: 8 },
    ],
  ),

  江苏: physicsHistory(
    '江苏',
    { teKong: 519, benKe: 463, zhuanKe: 220, total: 420000 },
    { teKong: 537, benKe: 482, zhuanKe: 220, total: 180000 },
    [
      { name: '南京大学', minScore: 660, ranking: 1 },
      { name: '东南大学', minScore: 645, ranking: 2 },
      { name: '南京航空航天大学', minScore: 610, ranking: 8 },
      { name: '南京理工大学', minScore: 605, ranking: 10 },
      { name: '苏州大学', minScore: 590, ranking: 15 },
    ],
  ),

  浙江: unified(
    '浙江',
    750,
    [
      { tier: '特控线', score: 592 },
      { tier: '一段线', score: 490 },
      { tier: '二段线', score: 268 },
    ],
    [
      seg(692, 89), seg(680, 756), seg(670, 2100), seg(660, 4200),
      seg(648, 11866), seg(640, 16416), seg(629, 24104), seg(620, 32000),
      seg(610, 42000), seg(600, 52000), seg(592, 61619, 1206),
      seg(580, 73765), seg(570, 85000), seg(550, 105000), seg(530, 140000),
      seg(520, 160000), seg(490, 184372), seg(450, 220000), seg(400, 260000),
      seg(268, 290790),
    ],
    [
      { name: '浙江大学', minScore: 672, ranking: 1 },
      { name: '浙江工业大学', minScore: 610, ranking: 8 },
      { name: '杭州电子科技大学', minScore: 605, ranking: 10 },
      { name: '浙江师范大学', minScore: 580, ranking: 15 },
      { name: '宁波大学', minScore: 590, ranking: 12 },
    ],
    '2025年浙江省高考分数线及一分一段表（浙江省教育考试院公布）',
  ),

  安徽: physicsHistory(
    '安徽',
    { teKong: 514, benKe: 461, zhuanKe: 200, total: 450000 },
    { teKong: 515, benKe: 477, zhuanKe: 200, total: 200000 },
    [
      { name: '中国科学技术大学', minScore: 670, ranking: 1 },
      { name: '合肥工业大学', minScore: 610, ranking: 5 },
      { name: '安徽大学', minScore: 580, ranking: 12 },
      { name: '安徽师范大学', minScore: 540, ranking: 25 },
      { name: '安徽医科大学', minScore: 530, ranking: 30 },
    ],
  ),

  福建: physicsHistory(
    '福建',
    { teKong: 520, benKe: 441, zhuanKe: 235, total: 220000 },
    { teKong: 531, benKe: 450, zhuanKe: 235, total: 100000 },
    [
      { name: '厦门大学', minScore: 630, ranking: 1 },
      { name: '福州大学', minScore: 590, ranking: 5 },
      { name: '福建师范大学', minScore: 550, ranking: 12 },
      { name: '华侨大学', minScore: 540, ranking: 15 },
      { name: '集美大学', minScore: 520, ranking: 22 },
    ],
  ),

  江西: physicsHistory(
    '江西',
    { teKong: 505, benKe: 429, zhuanKe: 240, total: 380000 },
    { teKong: 539, benKe: 486, zhuanKe: 290, total: 180000 },
    [
      { name: '南昌大学', minScore: 580, ranking: 1 },
      { name: '江西财经大学', minScore: 560, ranking: 5 },
      { name: '江西师范大学', minScore: 540, ranking: 10 },
      { name: '华东交通大学', minScore: 530, ranking: 15 },
      { name: '江西理工大学', minScore: 510, ranking: 22 },
    ],
  ),

  山东: unified(
    '山东',
    750,
    [
      { tier: '特控线', score: 521 },
      { tier: '一段线', score: 441 },
      { tier: '二段线', score: 150 },
    ],
    estimateSegments(750, 521, 441, 150, 680000),
    [
      { name: '山东大学', minScore: 610, ranking: 1 },
      { name: '中国海洋大学', minScore: 590, ranking: 5 },
      { name: '中国石油大学(华东)', minScore: 580, ranking: 8 },
      { name: '山东师范大学', minScore: 540, ranking: 20 },
      { name: '青岛大学', minScore: 530, ranking: 25 },
    ],
  ),

  河南: physicsHistory(
    '河南',
    { teKong: 535, benKe: 427, zhuanKe: 185, total: 900000 },
    { teKong: 552, benKe: 471, zhuanKe: 185, total: 400000 },
    [
      { name: '郑州大学', minScore: 590, ranking: 1 },
      { name: '河南大学', minScore: 560, ranking: 8 },
      { name: '河南师范大学', minScore: 530, ranking: 20 },
      { name: '河南理工大学', minScore: 510, ranking: 30 },
      { name: '河南科技大学', minScore: 500, ranking: 35 },
    ],
  ),

  湖北: physicsHistory(
    '湖北',
    { teKong: 516, benKe: 426, zhuanKe: 200, total: 400000 },
    { teKong: 536, benKe: 442, zhuanKe: 200, total: 180000 },
    [
      { name: '武汉大学', minScore: 640, ranking: 1 },
      { name: '华中科技大学', minScore: 635, ranking: 2 },
      { name: '华中师范大学', minScore: 580, ranking: 10 },
      { name: '武汉理工大学', minScore: 570, ranking: 12 },
      { name: '中国地质大学(武汉)', minScore: 560, ranking: 15 },
    ],
  ),

  湖南: physicsHistory(
    '湖南',
    { teKong: 476, benKe: 405, zhuanKe: 200, total: 420000 },
    { teKong: 503, benKe: 446, zhuanKe: 200, total: 200000 },
    [
      { name: '中南大学', minScore: 620, ranking: 1 },
      { name: '湖南大学', minScore: 610, ranking: 2 },
      { name: '湖南师范大学', minScore: 560, ranking: 10 },
      { name: '湘潭大学', minScore: 540, ranking: 18 },
      { name: '长沙理工大学', minScore: 530, ranking: 22 },
    ],
  ),

  广东: physicsHistory(
    '广东',
    { teKong: 534, benKe: 436, zhuanKe: 200, total: 550000 },
    { teKong: 557, benKe: 464, zhuanKe: 215, total: 250000 },
    [
      { name: '中山大学', minScore: 640, ranking: 1 },
      { name: '华南理工大学', minScore: 620, ranking: 2 },
      { name: '暨南大学', minScore: 590, ranking: 8 },
      { name: '华南师范大学', minScore: 570, ranking: 15 },
      { name: '深圳大学', minScore: 580, ranking: 12 },
    ],
  ),

  广西: physicsHistory(
    '广西',
    { teKong: 495, benKe: 370, zhuanKe: 200, total: 380000 },
    { teKong: 518, benKe: 402, zhuanKe: 200, total: 180000 },
    [
      { name: '广西大学', minScore: 550, ranking: 1 },
      { name: '广西师范大学', minScore: 520, ranking: 8 },
      { name: '桂林电子科技大学', minScore: 510, ranking: 12 },
      { name: '广西医科大学', minScore: 500, ranking: 15 },
      { name: '南宁师范大学', minScore: 480, ranking: 25 },
    ],
  ),

  海南: unified(
    '海南',
    900,
    [
      { tier: '特控线', score: 568 },
      { tier: '本科线', score: 480 },
      { tier: '专科线', score: 280 },
    ],
    estimateSegments(900, 568, 480, 280, 65000),
    [
      { name: '海南大学', minScore: 620, ranking: 1 },
      { name: '海南师范大学', minScore: 560, ranking: 5 },
      { name: '海南医学院', minScore: 540, ranking: 10 },
      { name: '琼台师范学院', minScore: 500, ranking: 18 },
      { name: '三亚学院', minScore: 480, ranking: 25 },
    ],
  ),

  重庆: physicsHistory(
    '重庆',
    { teKong: 498, benKe: 425, zhuanKe: 180, total: 200000 },
    { teKong: 515, benKe: 438, zhuanKe: 180, total: 100000 },
    [
      { name: '重庆大学', minScore: 620, ranking: 1 },
      { name: '西南大学', minScore: 580, ranking: 5 },
      { name: '西南政法大学', minScore: 560, ranking: 10 },
      { name: '重庆邮电大学', minScore: 550, ranking: 12 },
      { name: '四川外国语大学', minScore: 530, ranking: 20 },
    ],
  ),

  四川: physicsHistory(
    '四川',
    { teKong: 518, benKe: 438, zhuanKe: 150, total: 550000 },
    { teKong: 533, benKe: 467, zhuanKe: 150, total: 250000 },
    [
      { name: '四川大学', minScore: 630, ranking: 1 },
      { name: '电子科技大学', minScore: 625, ranking: 2 },
      { name: '西南交通大学', minScore: 590, ranking: 8 },
      { name: '西南财经大学', minScore: 580, ranking: 10 },
      { name: '四川农业大学', minScore: 540, ranking: 20 },
    ],
  ),

  贵州: physicsHistory(
    '贵州',
    { teKong: 483, benKe: 387, zhuanKe: 180, total: 320000 },
    { teKong: 517, benKe: 458, zhuanKe: 180, total: 150000 },
    [
      { name: '贵州大学', minScore: 540, ranking: 1 },
      { name: '贵州师范大学', minScore: 510, ranking: 8 },
      { name: '贵州医科大学', minScore: 500, ranking: 12 },
      { name: '贵州财经大学', minScore: 490, ranking: 15 },
      { name: '遵义医科大学', minScore: 480, ranking: 18 },
    ],
  ),

  云南: physicsHistory(
    '云南',
    { teKong: 495, benKe: 430, zhuanKe: 180, total: 350000 },
    { teKong: 535, benKe: 465, zhuanKe: 180, total: 160000 },
    [
      { name: '云南大学', minScore: 580, ranking: 1 },
      { name: '昆明理工大学', minScore: 550, ranking: 5 },
      { name: '云南师范大学', minScore: 530, ranking: 10 },
      { name: '云南财经大学', minScore: 520, ranking: 15 },
      { name: '西南林业大学', minScore: 500, ranking: 22 },
    ],
  ),

  西藏: {
    province: '西藏',
    examType: '高考',
    subjects: [
      trackSubject('理工类', 750, 350, [
        { tier: '本科一批(A类)', score: 300 },
        { tier: '本科一批(B类)', score: 400 },
        { tier: '本科二批(A类)', score: 266 },
        { tier: '专科线', score: 222 },
      ], estimateSegments(750, 400, 300, 222, 35000)),
      trackSubject('文史类', 750, 380, [
        { tier: '本科一批(A类)', score: 338 },
        { tier: '本科一批(B类)', score: 410 },
        { tier: '本科二批(A类)', score: 304 },
        { tier: '专科线', score: 255 },
      ], estimateSegments(750, 410, 338, 255, 15000)),
    ],
    keySchools: [
      { name: '西藏大学', minScore: 380, ranking: 1 },
      { name: '西藏民族大学', minScore: 350, ranking: 2 },
      { name: '西藏农牧学院', minScore: 320, ranking: 3 },
    ],
    updatedAt: '2025-06-25T00:00:00.000Z',
    source: '2025年西藏高考分数线（西藏教育考试院公布）',
  },

  陕西: physicsHistory(
    '陕西',
    { teKong: 473, benKe: 394, zhuanKe: 200, total: 280000 },
    { teKong: 497, benKe: 414, zhuanKe: 200, total: 130000 },
    [
      { name: '西安交通大学', minScore: 640, ranking: 1 },
      { name: '西北工业大学', minScore: 630, ranking: 2 },
      { name: '西安电子科技大学', minScore: 610, ranking: 5 },
      { name: '西北大学', minScore: 580, ranking: 12 },
      { name: '陕西师范大学', minScore: 570, ranking: 15 },
    ],
  ),

  甘肃: physicsHistory(
    '甘肃',
    { teKong: 475, benKe: 374, zhuanKe: 180, total: 200000 },
    { teKong: 500, benKe: 412, zhuanKe: 160, total: 100000 },
    [
      { name: '兰州大学', minScore: 580, ranking: 1 },
      { name: '西北师范大学', minScore: 520, ranking: 8 },
      { name: '兰州理工大学', minScore: 500, ranking: 15 },
      { name: '兰州交通大学', minScore: 490, ranking: 18 },
      { name: '甘肃农业大学', minScore: 470, ranking: 25 },
    ],
  ),

  青海: physicsHistory(
    '青海',
    { teKong: 420, benKe: 350, zhuanKe: 150, total: 50000 },
    { teKong: 450, benKe: 405, zhuanKe: 150, total: 25000 },
    [
      { name: '青海大学', minScore: 480, ranking: 1 },
      { name: '青海师范大学', minScore: 440, ranking: 3 },
      { name: '青海民族大学', minScore: 420, ranking: 5 },
    ],
  ),

  宁夏: physicsHistory(
    '宁夏',
    { teKong: 441, benKe: 372, zhuanKe: 150, total: 70000 },
    { teKong: 482, benKe: 404, zhuanKe: 150, total: 35000 },
    [
      { name: '宁夏大学', minScore: 500, ranking: 1 },
      { name: '宁夏医科大学', minScore: 480, ranking: 3 },
      { name: '北方民族大学', minScore: 450, ranking: 8 },
    ],
  ),

  新疆: {
    province: '新疆',
    examType: '高考',
    subjects: [
      trackSubject('理工类', 750, 380, [
        { tier: '本科一批', score: 421 },
        { tier: '本科二批', score: 280 },
        { tier: '专科线', score: 140 },
      ], estimateSegments(750, 421, 280, 140, 180000)),
      trackSubject('文史类', 750, 400, [
        { tier: '本科一批', score: 451 },
        { tier: '本科二批', score: 330 },
        { tier: '专科线', score: 140 },
      ], estimateSegments(750, 451, 330, 140, 90000)),
    ],
    keySchools: [
      { name: '新疆大学', minScore: 480, ranking: 1 },
      { name: '石河子大学', minScore: 460, ranking: 3 },
      { name: '新疆师范大学', minScore: 440, ranking: 8 },
      { name: '新疆医科大学', minScore: 430, ranking: 10 },
    ],
    updatedAt: '2025-06-25T00:00:00.000Z',
    source: '2025年新疆高考分数线（新疆教育考试院公布）',
  },
}

export function lookupGaokaoByProvince(province: string, city: string): ExamDataReference | null {
  const tpl = GAOBAO_PROVINCE_DATA[province]
  if (!tpl) return null
  return buildExamRef({
    province,
    city,
    examType: '高考',
    subjects: tpl.subjects,
    keySchools: tpl.keySchools,
    source: tpl.source,
    updatedAt: tpl.updatedAt,
  })
}

export const GAOBAO_PROVINCE_NAMES = Object.keys(GAOBAO_PROVINCE_DATA)
