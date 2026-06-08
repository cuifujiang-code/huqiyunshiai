/**
 * 2025 年浙江省 11 地市中考录取参考数据
 * 来源：各地市教育局 / 招生办公布信息整理
 */
import type { ExamDataReference } from '../types/planning'
import { buildExamRef, seg, subjectTotal } from './examReferenceHelpers'

export const ZHEJIANG_ZHONGKAO_2025: Record<string, ExamDataReference> = {
  杭州: buildExamRef({
    province: '浙江',
    city: '杭州',
    examType: '中考',
    subjects: [
      subjectTotal(
        650,
        520,
        [
          { tier: '集中统一第一段线', score: 563 },
          { tier: '名额分配基础控制线', score: 563 },
          { tier: '集中统一第二段线', score: 280 },
        ],
        [
          seg(630, 500), seg(620, 1200), seg(610, 2500), seg(600, 4500),
          seg(590, 7000), seg(580, 10000), seg(570, 14000), seg(563, 17000),
          seg(550, 22000), seg(530, 30000), seg(500, 40000), seg(450, 55000),
        ],
      ),
    ],
    keySchools: [
      { name: '杭州第二中学滨江校区', minScore: 630, ranking: 1 },
      { name: '杭州学军中学西溪校区', minScore: 629, ranking: 2 },
      { name: '杭州高级中学贡院校区', minScore: 627, ranking: 3 },
      { name: '杭州学军中学紫金港校区', minScore: 623, ranking: 4 },
      { name: '杭州第四中学下沙校区', minScore: 622, ranking: 5 },
      { name: '杭州师范大学附属中学', minScore: 617, ranking: 6 },
      { name: '杭州高级中学钱江校区', minScore: 617, ranking: 7 },
      { name: '杭州市长河高级中学', minScore: 619, ranking: 8 },
    ],
    source: '2025年杭州市区中考批次线及重点高中录取线（杭州市教育局）',
  }),

  宁波: buildExamRef({
    province: '浙江',
    city: '宁波',
    examType: '中考',
    subjects: [
      subjectTotal(
        660,
        530,
        [
          { tier: '普高最低控制线(慈溪等)', score: 415 },
          { tier: '普高统招参考线', score: 480 },
        ],
        [
          seg(642, 60), seg(636, 150), seg(630, 350), seg(622, 800),
          seg(619, 1200), seg(610, 2500), seg(600, 4500), seg(580, 8000),
          seg(560, 12000), seg(540, 18000), seg(500, 28000), seg(415, 45000),
        ],
      ),
    ],
    keySchools: [
      { name: '慈溪中学(统招一批)', minScore: 642, ranking: 1 },
      { name: '余姚中学', minScore: 641, ranking: 2 },
      { name: '镇海中学(统招)', minScore: 636, ranking: 3 },
      { name: '效实中学(统招)', minScore: 639, ranking: 4 },
      { name: '鄞州中学', minScore: 635, ranking: 5 },
      { name: '北仑中学', minScore: 619, ranking: 6 },
      { name: '奉化中学', minScore: 622, ranking: 7 },
      { name: '宁海中学(统招)', minScore: 635, ranking: 8 },
    ],
    source: '2025年宁波各区县中考录取分数线（宁波市教育局及各区县公布）',
  }),

  温州: buildExamRef({
    province: '浙江',
    city: '温州',
    examType: '中考',
    subjects: [
      subjectTotal(
        660,
        510,
        [
          { tier: '市区普高最低控制线', score: 450 },
          { tier: '瑞安市普高最低控制线', score: 453 },
        ],
        [
          seg(620, 800), seg(610, 1500), seg(600, 2800), seg(590, 4500),
          seg(580, 6500), seg(570, 9000), seg(560, 12000), seg(550, 16000),
          seg(530, 22000), seg(500, 32000), seg(450, 48000),
        ],
      ),
    ],
    keySchools: [
      { name: '温州中学', minScore: 620, ranking: 1 },
      { name: '温州第二高级中学', minScore: 610, ranking: 2 },
      { name: '温州外国语学校', minScore: 605, ranking: 3 },
      { name: '温州市第二十二中学', minScore: 595, ranking: 4 },
      { name: '瑞安中学', minScore: 615, ranking: 5 },
    ],
    source: '2025年温州市中考录取参考（温州市及各县市教育局公布）',
  }),

  绍兴: buildExamRef({
    province: '浙江',
    city: '绍兴',
    examType: '中考',
    subjects: [
      subjectTotal(
        660,
        530,
        [
          { tier: '市区普高参考线', score: 480 },
        ],
        [
          seg(627, 400), seg(624, 700), seg(620, 1200), seg(615, 1800),
          seg(608, 2800), seg(600, 4200), seg(590, 6500), seg(580, 9000),
          seg(560, 14000), seg(540, 20000), seg(520, 28000),
        ],
      ),
    ],
    keySchools: [
      { name: '绍兴一中', minScore: 627, ranking: 1 },
      { name: '鲁迅中学', minScore: 624, ranking: 2 },
      { name: '绍兴市高级中学', minScore: 620, ranking: 3 },
      { name: '阳明中学', minScore: 608, ranking: 4 },
      { name: '稽山中学', minScore: 595, ranking: 5 },
    ],
    source: '2025年绍兴市区中考录取分数线（绍兴市教育局公布）',
  }),

  嘉兴: buildExamRef({
    province: '浙江',
    city: '嘉兴',
    examType: '中考',
    subjects: [
      subjectTotal(
        660,
        540,
        [
          { tier: '第一批次最低控制线', score: 599 },
          { tier: '第二批次最低控制线', score: 518 },
        ],
        [
          seg(643, 187), seg(632, 551), seg(628, 673), seg(627, 743),
          seg(617, 1125), seg(614, 1251), seg(608, 1504), seg(600, 1911),
          seg(599, 1951), seg(586, 2760), seg(570, 3572), seg(553, 4265),
          seg(518, 5835),
        ],
      ),
    ],
    keySchools: [
      { name: '嘉兴市第一中学', minScore: 643, ranking: 1 },
      { name: '嘉兴高级中学', minScore: 632, ranking: 2 },
      { name: '嘉兴一实学校', minScore: 628, ranking: 3 },
      { name: '清华附中嘉兴实验高级中学', minScore: 627, ranking: 4 },
      { name: '北京师范大学附属嘉兴南湖高级中学', minScore: 614, ranking: 5 },
      { name: '嘉兴市秀州中学', minScore: 608, ranking: 6 },
    ],
    source: '2025年嘉兴市本级中考分数线及一分一段（嘉兴市教育考试院公布）',
  }),

  湖州: buildExamRef({
    province: '浙江',
    city: '湖州',
    examType: '中考',
    subjects: [
      subjectTotal(
        660,
        530,
        [
          { tier: '民办普高最低控制线', score: 350 },
        ],
        [
          seg(633, 300), seg(624, 700), seg(620, 1100), seg(615, 1600),
          seg(607, 2400), seg(600, 3500), seg(590, 5500), seg(580, 8000),
          seg(560, 12000), seg(545, 16000), seg(528, 22000),
        ],
      ),
    ],
    keySchools: [
      { name: '湖州中学', minScore: 633, ranking: 1 },
      { name: '湖州二中', minScore: 624, ranking: 2 },
      { name: '吴兴高级中学', minScore: 607, ranking: 3 },
      { name: '南浔高级中学', minScore: 553, ranking: 4 },
      { name: '湖州一中', minScore: 545, ranking: 5 },
    ],
    source: '2025年湖州市区中考录取分数线（湖州市教育局公布）',
  }),

  金华: buildExamRef({
    province: '浙江',
    city: '金华',
    examType: '中考',
    subjects: [
      subjectTotal(
        660,
        520,
        [
          { tier: '普高最低控制线', score: 450 },
          { tier: '普职融通班控制线', score: 383 },
          { tier: '中本一体化控制线', score: 495 },
        ],
        [
          seg(633, 689), seg(623, 1200), seg(615, 1800), seg(610, 2400),
          seg(600, 3800), seg(590, 5500), seg(580, 7500), seg(568, 10000),
          seg(553, 14000), seg(530, 20000), seg(500, 30000), seg(450, 42000),
        ],
      ),
    ],
    keySchools: [
      { name: '金华第一中学', minScore: 633, ranking: 1 },
      { name: '浙江师范大学附属中学', minScore: 623, ranking: 2 },
      { name: '金华市外国语学校', minScore: 610, ranking: 3 },
      { name: '金华市汤溪高级中学', minScore: 597, ranking: 4 },
      { name: '金华市宾虹高级中学', minScore: 568, ranking: 5 },
    ],
    source: '2025年金华市区中考录取分数线（金华市教育考试院公布）',
  }),

  台州: buildExamRef({
    province: '浙江',
    city: '台州',
    examType: '中考',
    subjects: [
      subjectTotal(
        660,
        520,
        [
          { tier: '市区普高参考线', score: 480 },
        ],
        [
          seg(628, 500), seg(622, 900), seg(618, 1400), seg(610, 2200),
          seg(600, 3800), seg(590, 5500), seg(580, 8000), seg(570, 11000),
          seg(560, 15000), seg(540, 22000), seg(520, 30000),
        ],
      ),
    ],
    keySchools: [
      { name: '台州市第一中学(椒江)', minScore: 628, ranking: 1 },
      { name: '北京师范大学台州附属高级中学(黄岩)', minScore: 629, ranking: 2 },
      { name: '北京师范大学台州附属高级中学(椒江)', minScore: 622, ranking: 3 },
      { name: '台州中学', minScore: 625, ranking: 4 },
      { name: '温岭中学', minScore: 620, ranking: 5 },
    ],
    source: '2025年台州市区中考录取分数线（台州市教育局公布）',
  }),

  丽水: buildExamRef({
    province: '浙江',
    city: '丽水',
    examType: '中考',
    subjects: [
      subjectTotal(
        660,
        510,
        [
          { tier: '城区分配生最低控制线', score: 602 },
          { tier: '农村分配生最低控制线', score: 572 },
        ],
        [
          seg(616, 240), seg(610, 450), seg(600, 900), seg(590, 1500),
          seg(580, 2500), seg(573, 3500), seg(560, 5500), seg(545, 8000),
          seg(533, 11000), seg(520, 15000), seg(500, 22000),
        ],
      ),
    ],
    keySchools: [
      { name: '丽水中学(莲都)', minScore: 616, ranking: 1 },
      { name: '龙泉中学', minScore: 573, ranking: 2 },
      { name: '缙云中学', minScore: 590, ranking: 3 },
      { name: '松阳一中', minScore: 553, ranking: 4 },
      { name: '遂昌中学', minScore: 560, ranking: 5 },
    ],
    source: '2025年丽水市中考录取参考（丽水市教育局及各县公布）',
  }),

  衢州: buildExamRef({
    province: '浙江',
    city: '衢州',
    examType: '中考',
    subjects: [
      subjectTotal(
        660,
        520,
        [
          { tier: '普高参考线', score: 460 },
        ],
        [
          seg(623, 140), seg(606, 802), seg(591, 1549), seg(579, 2134),
          seg(569, 2590), seg(560, 3200), seg(550, 4000), seg(540, 5000),
          seg(530, 6000), seg(517, 4268), seg(500, 7500), seg(460, 12000),
        ],
      ),
    ],
    keySchools: [
      { name: '衢州二中', minScore: 623, ranking: 1 },
      { name: '衢州一中', minScore: 606, ranking: 2 },
      { name: '衢州三中', minScore: 591, ranking: 3 },
      { name: '江山中学(统招)', minScore: 596, ranking: 4 },
      { name: '衢州高级中学', minScore: 569, ranking: 5 },
    ],
    source: '2025年衢州市区中考录取分数线（衢州市教育局公布）',
  }),

  舟山: buildExamRef({
    province: '浙江',
    city: '舟山',
    examType: '中考',
    subjects: [
      subjectTotal(
        660,
        520,
        [
          { tier: '普高参考线', score: 480 },
        ],
        [
          seg(620, 400), seg(610, 800), seg(600, 1400), seg(590, 2200),
          seg(580, 3200), seg(570, 4500), seg(560, 6000), seg(550, 8000),
          seg(540, 11000), seg(520, 16000), seg(500, 24000),
        ],
      ),
    ],
    keySchools: [
      { name: '舟山中学', minScore: 620, ranking: 1 },
      { name: '舟山南海实验学校', minScore: 605, ranking: 2 },
      { name: '舟山绿城育华学校', minScore: 595, ranking: 3 },
      { name: '普陀中学', minScore: 590, ranking: 4 },
      { name: '岱山中学', minScore: 580, ranking: 5 },
    ],
    source: '2025年舟山市中考录取参考（舟山市教育局公布）',
  }),
}

export function lookupZhejiangZhongkao(city: string): ExamDataReference | null {
  return ZHEJIANG_ZHONGKAO_2025[city] ?? null
}

export const ZHEJIANG_CITIES = Object.keys(ZHEJIANG_ZHONGKAO_2025)
