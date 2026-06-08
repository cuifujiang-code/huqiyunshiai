/** @typedef {{ month: string, event: string, note?: string, examType?: string }} ExamTimelineNode */

/** @type {Record<string, object>} */
export const PROVINCE_EXAM_PROFILES = {
  浙江: {
    province: '浙江',
    gaokaoMode: '3+3 新高考（语数外 + 3门选考，等级赋分）',
    electiveRule: '7选3，首考与高考两次机会，取等级较高者计入总分',
    electiveSubjects: ['物理', '化学', '生物', '历史', '地理', '政治', '技术'],
    timeline: [
      { month: '每年1月', event: '选考/学考首考', note: '外语+选考科目首考' },
      { month: '每年6月', event: '高考', note: '语数外+选考等级赋分750分' },
      { month: '6月底-7月初', event: '首轮志愿填报' },
      { month: '7月中下旬', event: '二段志愿填报' },
    ],
    volunteerNotes: [
      '浙江"专业+学校"平行志愿，需结合位次与选科匹配',
      '首考释放科目后复习时间可用于剩余科目冲刺',
    ],
  },
  default: {
    province: '全国通用',
    gaokaoMode: '3+1+2 或传统高考',
    electiveSubjects: ['物理', '化学', '生物', '历史', '地理', '政治'],
    timeline: [
      { month: '3-4月', event: '一模' },
      { month: '5月', event: '二模/三模' },
      { month: '6月', event: '高考' },
      { month: '6月下旬', event: '志愿填报' },
    ],
    volunteerNotes: ['请查阅本省教育考试院发布指南'],
  },
}

export function getProvinceExamProfile(province) {
  return PROVINCE_EXAM_PROFILES[province] ?? {
    ...PROVINCE_EXAM_PROFILES.default,
    province: province || '全国通用',
  }
}
