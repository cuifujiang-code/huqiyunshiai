/** 各省考试制度与关键时间节点（2025-2026 学年参考） */

export type AcademicTerm = '上学期' | '下学期'

export type ExamSessionType =
  | '月考'
  | '期中'
  | '期末'
  | '一模'
  | '二模'
  | '三模'
  | '学考'
  | '首考'
  | '高考'
  | '中考'
  | '其他'

export interface ExamTimelineNode {
  month: string
  event: string
  examType?: ExamSessionType
  note?: string
}

export interface ProvinceExamProfile {
  province: string
  gaokaoMode: string
  electiveRule?: string
  electiveSubjects?: string[]
  requiredSubjects?: string[]
  timeline: ExamTimelineNode[]
  volunteerNotes?: string[]
}

export const ZHEJIANG_ELECTIVE_SUBJECTS = [
  '物理', '化学', '生物', '历史', '地理', '政治', '技术',
] as const

export const PROVINCE_EXAM_PROFILES: Record<string, ProvinceExamProfile> = {
  浙江: {
    province: '浙江',
    gaokaoMode: '3+3 新高考（语数外 + 3门选考，等级赋分）',
    electiveRule: '7选3，首考与高考两次机会，取等级较高者计入总分',
    electiveSubjects: [...ZHEJIANG_ELECTIVE_SUBJECTS],
    requiredSubjects: ['语文', '数学', '英语'],
    timeline: [
      { month: '每年1月', event: '选考/学考首考', examType: '首考', note: '外语+选考科目首考，成绩可用于高考' },
      { month: '每年6月', event: '高考（含选考第二次）', examType: '高考', note: '语数外+选考等级赋分合成750分' },
      { month: '6月下旬', event: '高考成绩公布', note: '同步发布一段线、特控线' },
      { month: '6月底-7月初', event: '首轮志愿填报', note: '普通类一段平行录取' },
      { month: '7月中下旬', event: '二段志愿填报', note: '剩余计划及二段考生填报' },
      { month: '11月', event: '学考/选考报名', note: '高二下或高三上' },
    ],
    volunteerNotes: [
      '浙江采用"专业+学校"平行志愿，需结合位次与选科匹配筛选',
      '首考释放的科目复习时间可用于剩余科目冲刺',
      '一段线约490分、特控线592分（2025参考），请以当年公布为准',
    ],
  },
  北京: {
    province: '北京',
    gaokaoMode: '3+3 新高考',
    electiveSubjects: ['物理', '化学', '生物', '历史', '地理', '政治'],
    requiredSubjects: ['语文', '数学', '英语'],
    timeline: [
      { month: '12月', event: '首次英语听说机考', examType: '其他' },
      { month: '3月', event: '学考合格考', examType: '学考' },
      { month: '4-5月', event: '一模、二模', examType: '一模' },
      { month: '6月', event: '高考', examType: '高考' },
      { month: '6月底', event: '本科批次志愿填报', note: '本科提前批+本科普通批' },
    ],
  },
  上海: {
    province: '上海',
    gaokaoMode: '3+3 新高考（等级赋分，满分660）',
    electiveSubjects: ['物理', '化学', '生物', '历史', '地理', '政治'],
    requiredSubjects: ['语文', '数学', '英语'],
    timeline: [
      { month: '5月', event: '等级考', examType: '学考' },
      { month: '6月', event: '秋考/外语二次', examType: '高考' },
      { month: '6月底', event: '本科志愿填报', note: '院校专业组模式' },
    ],
  },
  default: {
    province: '全国通用',
    gaokaoMode: '3+1+2 或传统高考（以本省当年政策为准）',
    electiveSubjects: ['物理', '化学', '生物', '历史', '地理', '政治'],
    requiredSubjects: ['语文', '数学', '英语'],
    timeline: [
      { month: '11月', event: '高考报名', examType: '其他' },
      { month: '3-4月', event: '一模', examType: '一模' },
      { month: '4-5月', event: '二模/三模', examType: '二模' },
      { month: '6月', event: '全国高考', examType: '高考' },
      { month: '6月下旬', event: '出分与志愿填报', note: '分批分次填报' },
    ],
    volunteerNotes: ['请查阅本省教育考试院发布的志愿填报指南'],
  },
}

export function getProvinceExamProfile(province: string): ProvinceExamProfile {
  return PROVINCE_EXAM_PROFILES[province] ?? {
    ...PROVINCE_EXAM_PROFILES.default,
    province: province || '全国通用',
  }
}

export const EXAM_SESSION_OPTIONS: ExamSessionType[] = [
  '月考', '期中', '期末', '一模', '二模', '三模', '学考', '首考', '高考', '中考', '其他',
]

export const ACADEMIC_TERMS: AcademicTerm[] = ['上学期', '下学期']
